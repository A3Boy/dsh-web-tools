/**
 * dsh-web-tools — Exa provider adapter (neural/semantic search).
 *
 * Canonical reference: https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 * - POST https://api.exa.ai/search with `x-api-key` header (canonical raw REST)
 * - Content mode: `contents.highlights = { maxCharacters: 4000 }` (token-efficient,
 *   highly recommended for agent workflows) — falls back to `text` when highlights
 *   are absent
 * - `type: "auto"` for balanced neural / keyword retrieval
 * - /contents uses `urls` + `highlights` for fetch
 *
 * @module
 */
import { providerError, classifyHttpStatus } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";
/**
 * Parse an Exa HTTP error response into a classified ProviderError.
 *
 * Exa returns machine-readable error `tag` in the JSON body (verified
 * against https://exa.ai/docs/reference/error-codes):
 *   INVALID_API_KEY → 401, NO_MORE_CREDITS → 402,
 *   API_KEY_BUDGET_EXCEEDED → 402, TEAM_BUDGET_EXCEEDED → 402,
 *   ACCESS_DENIED → 403.
 *
 * 429 has a separate shape (no tag, may carry Retry-After header).
 * We parse Retry-After (seconds → ms) and attach it to the error message
 * so the runtime can use it for cooldown.
 */
async function throwExaError(res) {
    const status = res.status;
    // Try to read Exa's JSON error body for the machine-readable tag.
    let tag;
    let message;
    try {
        const body = await res.json();
        tag = typeof body?.error?.tag === "string" ? body.error.tag : undefined;
        message = typeof body?.error?.message === "string" ? body.error.message : undefined;
    }
    catch {
        // Non-JSON body — fall through to status-based classification.
    }
    // Retry-After header (seconds) — present on 429, sometimes on 503.
    const retryAfterRaw = res.headers.get("retry-after");
    let retryHint = "";
    if (retryAfterRaw) {
        const seconds = Number(retryAfterRaw);
        if (Number.isFinite(seconds) && seconds > 0) {
            retryHint = ` (retry after ${seconds}s)`;
        }
    }
    // Exa-specific tag → precise code mapping.
    if (tag === "INVALID_API_KEY" || status === 401) {
        throw providerError("auth", `Exa: invalid or missing API key${retryHint}`, status);
    }
    if (tag === "NO_MORE_CREDITS" || tag === "API_KEY_BUDGET_EXCEEDED" || tag === "TEAM_BUDGET_EXCEEDED" || status === 402) {
        throw providerError("quota", `Exa: ${tag ?? "credits exhausted"}${retryHint}`, status);
    }
    if (tag === "ACCESS_DENIED" || status === 403) {
        throw providerError("auth", `Exa: access denied${retryHint}`, status);
    }
    if (status === 429) {
        throw providerError("rate-limit", `Exa: rate limit exceeded${retryHint}`, status);
    }
    if (status === 408) {
        throw providerError("timeout", `Exa: request timed out`, status);
    }
    if (status >= 500) {
        throw providerError("server", `Exa: server error (HTTP ${status})${retryHint}`, status);
    }
    // Fallback: classify by status using the shared taxonomy.
    const code = classifyHttpStatus(status);
    throw providerError(code, `Exa: ${message ?? `HTTP ${status}`}${retryHint}`, status);
}
export const EXA_META = {
    name: "exa",
    label: "Exa",
    description: "Semantic / neural web search (highlights & auto search)",
    credSuffix: "EXA",
    fetchCapable: true,
    needsBaseUrl: false,
};
export const ExaProvider = {
    ...EXA_META,
    async search(query, maxResults, apiKey, _baseUrl, signal) {
        if (!apiKey)
            throw providerError("config", "Exa API key is not configured");
        const numResults = typeof maxResults === "number" && maxResults > 0 ? Math.min(maxResults, 25) : 10;
        const res = await fetchWithProxy(EXA_SEARCH_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
            },
            body: JSON.stringify({
                query,
                type: "auto",
                numResults,
                contents: {
                    highlights: {
                        maxCharacters: 4000,
                    },
                },
            }),
            signal,
        });
        if (!res.ok)
            await throwExaError(res);
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
            // highlights[] is query-relevant extractive markup (preferred over raw text for agent density)
            if (Array.isArray(r.highlights) && r.highlights.length > 0) {
                const joined = r.highlights.filter((h) => typeof h === "string").join("\n\n").trim();
                if (joined)
                    s.snippet = joined.length > 1200 ? joined.slice(0, 1200) + "…" : joined;
            }
            else if (typeof r.text === "string" && r.text) {
                s.snippet = r.text.length > 600 ? r.text.slice(0, 600) + "…" : r.text;
            }
            if (typeof r.publishedDate === "string" && r.publishedDate)
                s.publishedAt = r.publishedDate;
            return s;
        })
            .filter((x) => x !== null);
        return { sources };
    },
    async fetch(url, apiKey, _baseUrl, signal) {
        if (!apiKey)
            throw providerError("config", "Exa API key is not configured");
        const res = await fetchWithProxy(EXA_CONTENTS_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
            },
            body: JSON.stringify({
                urls: [url],
                highlights: {
                    maxCharacters: 4000,
                },
                text: true,
            }),
            signal,
        });
        if (!res.ok)
            await throwExaError(res);
        const data = await res.json();
        const result = data?.results?.[0];
        // Exa returns `highlights` (query-relevant excerpts) for token efficiency;
        // fall back to full `text` when highlights absent.
        const highlights = Array.isArray(result?.highlights) ? result.highlights : [];
        const text = typeof result?.text === "string" ? result.text : "";
        const content = highlights.length > 0 ? highlights.join("\n\n") : text;
        if (!content)
            throw providerError("server", `Exa returned no content for ${url}`);
        return { text: content };
    },
};
