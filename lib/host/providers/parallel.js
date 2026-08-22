/**
 * dsh-web-tools — Parallel provider adapter (8th adapter).
 *
 * Parallel is an agent-native web tools API: Search returns LLM-ranked
 * compressed excerpts, Extract returns page bodies as markdown.
 *
 * Search  : POST https://api.parallel.ai/v1/search
 *           x-api-key: <apiKey>, Content-Type: application/json
 *           body { objective, search_queries[], mode, advanced_settings }
 *           → results[] (url / title / publish_date / excerpts[])
 * Extract : POST https://api.parallel.ai/v1/extract
 *           body { urls[], advanced_settings: { full_content: true } }
 *           → results[] (url / title / excerpts[] / full_content)
 *
 * First-version scope (frozen):
 *   - REST only — the anonymous Search MCP endpoint is intentionally NOT
 *     wired into the provider (two auth semantics in one adapter would be
 *     confusing);
 *   - mode set to "advanced" (deep agent-optimized retrieval, official default);
 *   - no session_id (optional upstream; correlating search→extract runs
 *     would need per-run state this plugin deliberately avoids);
 *   - quota is dashboard-only — Parallel exposes usage/spend in its
 *     Platform dashboard, not through a balance endpoint an ordinary API
 *     key can call.
 * @module
 */
import { providerError, throwIfHttp, resolveContext } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
const PARALLEL_SEARCH_URL = "https://api.parallel.ai/v1/search";
const PARALLEL_EXTRACT_URL = "https://api.parallel.ai/v1/extract";
/** Parallel caps max_results at 20 per search. */
const PARALLEL_MAX_RESULTS = 20;
/** Each entry in search_queries may be at most 200 characters. */
const PARALLEL_QUERY_MAX_CHARS = 200;
/** Snippet budget: excerpts are dense but several may add up — cap the joined text. */
const PARALLEL_SNIPPET_MAX_CHARS = 500;
export const PARALLEL_META = {
    name: "parallel",
    label: "Parallel",
    description: "Agent-optimized search + extract (LLM-ranked excerpts)",
    credSuffix: "PARALLEL",
    fetchCapable: true,
    needsBaseUrl: false,
};
export const ParallelProvider = {
    ...PARALLEL_META,
    async search(query, maxResults, apiKey, _baseUrl, contextOrSignal) {
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Parallel API key is not configured");
        const { signal, options } = resolveContext(contextOrSignal);
        const count = clampParallelCount(maxResults);
        const res = await fetchWithProxy(PARALLEL_SEARCH_URL, {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": token },
            body: JSON.stringify(buildParallelSearchBody(query, count, options)),
            signal,
        });
        throwIfHttp("Parallel", res);
        let raw;
        try {
            raw = await res.json();
        }
        catch {
            throw providerError("invalid-response", "Parallel returned invalid JSON");
        }
        return { sources: parseParallelSearchResults(raw, count) };
    },
    async fetch(url, apiKey, _baseUrl, contextOrSignal) {
        const { signal } = resolveContext(contextOrSignal);
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Parallel API key is not configured");
        // full_content must be explicitly requested — Extract defaults to
        // excerpts-only, which would return a snippet where web_fetch wants the
        // page body.
        const res = await fetchWithProxy(PARALLEL_EXTRACT_URL, {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": token },
            body: JSON.stringify({ urls: [url], advanced_settings: { full_content: true } }),
            signal,
        });
        throwIfHttp("Parallel", res);
        let raw;
        try {
            raw = await res.json();
        }
        catch {
            throw providerError("invalid-response", "Parallel Extract returned invalid JSON");
        }
        const text = parseParallelExtractText(raw);
        if (!text)
            throw providerError("server", `Parallel Extract returned no content for ${url}`);
        return { text };
    },
};
/** Clamp the requested result count into Parallel's accepted range (1..20). */
export function clampParallelCount(maxResults) {
    return Math.min(Math.max(maxResults ?? 5, 1), PARALLEL_MAX_RESULTS);
}
/**
 * Normalize one raw query into a Parallel search_queries entry: whitespace
 * collapsed, trimmed, and capped at 200 characters (the per-query API limit).
 */
export function normalizeParallelQuery(query) {
    return query.replace(/\s+/g, " ").trim().slice(0, PARALLEL_QUERY_MAX_CHARS);
}
/**
 * Build the /v1/search request body. `objective` carries the full natural
 * language goal; `search_queries` carries at least one derived query (the
 * docs recommend 2–3 but accept one). Mode is pinned to "basic" — see the
 * module doc. Count is the ALREADY clamped value.
 */
export function buildParallelSearchBody(query, count, options) {
    const body = {
        objective: query,
        search_queries: [normalizeParallelQuery(query)],
        mode: options?.mode ?? "advanced",
        advanced_settings: { max_results: count },
    };
    // max_chars_total is a top-level /v1/search field (docs.parallel.ai).
    // Putting it in advanced_settings — as the original code did — causes
    // HTTP 422. Only send it when the user explicitly overrides it.
    if (typeof options?.maxCharsTotal === "number") {
        body.max_chars_total = options.maxCharsTotal;
    }
    return body;
}
/**
 * Parse Parallel's search envelope ({ results: [...] }) into normalized
 * sources. `url` is required per item; `excerpts` (an array of LLM-ranked
 * compressed passages) are joined into the snippet and capped so a multi-
 * excerpt result cannot balloon the DSH search payload.
 */
export function parseParallelSearchResults(body, maxResults) {
    const results = body?.results;
    if (!Array.isArray(results))
        return [];
    const sources = [];
    for (const item of results) {
        if (sources.length >= maxResults)
            break;
        if (!item || typeof item !== "object")
            continue;
        const { url, title, publish_date, excerpts } = item;
        if (typeof url !== "string" || url.length === 0)
            continue;
        const source = { url };
        if (typeof title === "string" && title)
            source.title = title;
        const excerptText = Array.isArray(excerpts)
            ? excerpts
                .filter((x) => typeof x === "string")
                .join("\n\n")
                .trim()
            : "";
        if (excerptText)
            source.snippet = excerptText.slice(0, PARALLEL_SNIPPET_MAX_CHARS);
        if (typeof publish_date === "string" && publish_date)
            source.publishedAt = publish_date;
        sources.push(source);
    }
    return sources;
}
/**
 * Extract the page text from Parallel's extract envelope. Prefers
 * `full_content` (only present when requested); falls back to the joined
 * excerpts. Returns undefined when neither carries usable text — the caller
 * classifies that as a server failure.
 */
export function parseParallelExtractText(body) {
    const results = body?.results;
    const first = Array.isArray(results) ? results[0] : undefined;
    if (!first || typeof first !== "object")
        return undefined;
    const { full_content, excerpts } = first;
    if (typeof full_content === "string" && full_content.trim())
        return full_content;
    if (Array.isArray(excerpts)) {
        const text = excerpts
            .filter((x) => typeof x === "string")
            .join("\n\n")
            .trim();
        if (text)
            return text;
    }
    return undefined;
}
