/**
 * dsh-web-tools — Tavily provider adapter.
 *
 * API reference: https://docs.tavily.com/documentation/api-reference/endpoint/search
 * - Base URL: https://api.tavily.com
 * - Auth: `Authorization: Bearer tvly-...` (verified 2026-08-20)
 * - POST /search — search_depth basic/advanced/fast/ultra-fast, chunks_per_source
 * - POST /extract — URL extraction for web_fetch
 *
 * Error codes (verified):
 *   400 bad request, 401 auth, 429 rate-limit,
 *   432 plan limit exceeded, 433 paygo limit exceeded, 500 server
 *
 * @module
 */
import { providerError, classifyHttpStatus } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";
export const TAVILY_META = {
    name: "tavily",
    label: "Tavily",
    description: "AI-optimized web search (chunks & depth)",
    credSuffix: "TAVILY",
    fetchCapable: true,
    needsBaseUrl: false,
};
/**
 * Parse a Tavily HTTP error response into a classified ProviderError.
 * Tavily returns `{ detail: { error: "..." } }` on error.
 * 432 = plan limit, 433 = paygo limit — both treated as quota.
 */
async function throwTavilyError(res) {
    const status = res.status;
    let message;
    try {
        const body = await res.json();
        message = typeof body?.detail?.error === "string" ? body.detail.error : undefined;
    }
    catch {
        // Non-JSON body — fall through to status-based classification.
    }
    const retryAfterRaw = res.headers.get("retry-after");
    let retryHint = "";
    if (retryAfterRaw) {
        const seconds = Number(retryAfterRaw);
        if (Number.isFinite(seconds) && seconds > 0) {
            retryHint = ` (retry after ${seconds}s)`;
        }
    }
    if (status === 401 || status === 403) {
        throw providerError("auth", `Tavily: ${message ?? "auth failed"}${retryHint}`, status);
    }
    if (status === 432 || status === 433) {
        throw providerError("quota", `Tavily: ${message ?? "plan limit exceeded"}${retryHint}`, status);
    }
    if (status === 429) {
        throw providerError("rate-limit", `Tavily: rate limit exceeded${retryHint}`, status);
    }
    if (status === 408) {
        throw providerError("timeout", `Tavily: request timed out`, status);
    }
    if (status >= 500) {
        throw providerError("server", `Tavily: server error (HTTP ${status})${retryHint}`, status);
    }
    const code = classifyHttpStatus(status);
    throw providerError(code, `Tavily: ${message ?? `HTTP ${status}`}${retryHint}`, status);
}
export const TavilyProvider = {
    ...TAVILY_META,
    async search(query, maxResults, apiKey, _baseUrl, signal) {
        if (!apiKey)
            throw providerError("config", "Tavily API key is not configured");
        // Tavily caps max_results at 20 (verified 2026-08-20).
        const max_results = Math.min(Math.max(maxResults ?? 5, 1), 20);
        const res = await fetchWithProxy(TAVILY_SEARCH_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                query,
                search_depth: "basic",
                chunks_per_source: 3,
                max_results,
                include_answer: "basic",
            }),
            signal,
        });
        if (!res.ok)
            await throwTavilyError(res);
        const raw = await res.json();
        const results = Array.isArray(raw?.results) ? raw.results : [];
        const sources = results
            .map((r) => {
            const url = typeof r?.url === "string" ? r.url : "";
            if (!url)
                return null;
            const s = { url };
            if (typeof r.title === "string" && r.title)
                s.title = r.title;
            // Tavily returns `content` (query-relevant chunks joined as
            // "<chunk 1> [...] <chunk 2>" — the best agent evidence field.
            if (typeof r.content === "string" && r.content) {
                s.snippet = r.content.length > 1200 ? r.content.slice(0, 1200) + "…" : r.content;
            }
            if (typeof r.published_date === "string" && r.published_date)
                s.publishedAt = r.published_date;
            return s;
        })
            .filter((x) => x !== null);
        const outcome = { sources };
        // Tavily's include_answer returns an LLM-generated answer.
        if (typeof raw?.answer === "string" && raw.answer)
            outcome.content = raw.answer;
        return outcome;
    },
    async fetch(url, apiKey, _baseUrl, signal) {
        if (!apiKey)
            throw providerError("config", "Tavily API key is not configured");
        const res = await fetchWithProxy(TAVILY_EXTRACT_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ urls: [url] }),
            signal,
        });
        if (!res.ok)
            await throwTavilyError(res);
        const data = await res.json();
        const failed = Array.isArray(data?.failed_results) ? data.failed_results[0] : undefined;
        if (failed)
            throw providerError("server", `Tavily extract failed for ${failed.url ?? url}: ${failed.error ?? "unknown"}`);
        const content = data?.results?.[0]?.raw_content;
        if (typeof content !== "string" || !content)
            throw providerError("server", `Tavily returned no content for ${url}`);
        return { text: content };
    },
};
