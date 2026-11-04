/**
 * dsh-web-tools — Keenable provider adapter.
 *
 * Search: POST https://api.keenable.ai/v1/search (X-API-Key) with
 *   `{ query, max_results, site?, published_after?, published_before? }`;
 *   results live at `results[]` with
 *   `{ title, url, description, snippet, published_at }`. The snippet prefers
 *   `description`, falls back to `snippet`, and is capped either way.
 * API reference: https://docs.keenable.ai/api-reference/search
 * Search-only: web_fetch falls back to the built-in generic fetcher.
 * @module
 */
import { providerError, throwIfHttp, resolveContext } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
import { endpointViewOf } from "../endpoints.js";
const KEENABLE_SEARCH_URL = "https://api.keenable.ai/v1/search";
const KEENABLE_MAX_RESULTS = 20;
const KEENABLE_SNIPPET_MAX_CHARS = 600;
export const KEENABLE_META = {
    name: "keenable",
    label: "Keenable",
    description: "Web search API (description-first snippets)",
    credSuffix: "KEENABLE",
    fetchCapable: false,
    needsBaseUrl: false,
};
/** Normalize a Keenable `/v1/search` JSON body into sources. Pure, for tests. */
export function parseKeenableSearchJson(body, limit) {
    const results = body?.results;
    if (!Array.isArray(results))
        return [];
    const sources = [];
    for (const r of results) {
        const url = typeof r?.url === "string" ? r.url : "";
        if (!url)
            continue;
        const s = { url };
        if (typeof r.title === "string" && r.title)
            s.title = r.title;
        const rawSnippet = typeof r.description === "string" && r.description
            ? r.description
            : typeof r.snippet === "string" && r.snippet
                ? r.snippet
                : undefined;
        if (rawSnippet) {
            s.snippet = rawSnippet.length > KEENABLE_SNIPPET_MAX_CHARS
                ? rawSnippet.slice(0, KEENABLE_SNIPPET_MAX_CHARS) + "…"
                : rawSnippet;
        }
        if (typeof r.published_at === "string" && r.published_at) {
            s.publishedAt = r.published_at;
        }
        sources.push(s);
        if (sources.length >= limit)
            break;
    }
    return sources;
}
/** Build the `/v1/search` request body, forwarding site and date hints. Pure, for tests. */
export function buildKeenableSearchBody(query, limit, hints) {
    const body = { query, max_results: limit };
    // Keenable takes a single `site`; use the first included domain.
    const site = hints?.domains?.include?.[0];
    if (site)
        body.site = site;
    if (hints?.freshness?.after)
        body.published_after = hints.freshness.after;
    if (hints?.freshness?.before)
        body.published_before = hints.freshness.before;
    return body;
}
export const KeenableProvider = {
    ...KEENABLE_META,
    async search(query, maxResults, apiKey, baseUrl, contextOrSignal) {
        const { signal, hints } = resolveContext(contextOrSignal);
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Keenable API key is not configured");
        const limit = Math.min(Math.max(maxResults ?? 5, 1), KEENABLE_MAX_RESULTS);
        const cleanQ = hints?.cleanQuery ? hints.cleanQuery : query;
        const searchUrl = endpointViewOf("keenable", { keenable: baseUrl })?.url ?? KEENABLE_SEARCH_URL;
        const res = await fetchWithProxy(searchUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                accept: "application/json",
                "x-api-key": token,
                "x-keenable-title": "dsh-web-tools",
            },
            body: JSON.stringify(buildKeenableSearchBody(cleanQ, limit, hints)),
            signal,
        }, { provider: "keenable" });
        throwIfHttp("Keenable", res);
        let body;
        try {
            body = await res.json();
        }
        catch {
            throw providerError("invalid-response", "Keenable returned a non-JSON search response");
        }
        return { sources: parseKeenableSearchJson(body, limit) };
    },
    async fetch(_url, _apiKey, _baseUrl, _signal) {
        throw providerError("config", "Keenable does not provide native fetch");
    },
};
