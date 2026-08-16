/**
 * dsh-web-tools — Exa provider adapter (neural/semantic search).
 *
 * Canonical reference: https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 * - POST https://api.exa.ai/search with `x-api-key` header
 * - Content mode: `contents.highlights: true` (token-efficient, recommended
 *   for agent workflows) — NOT `text: true` which can blow up context
 * - `type: "auto"` for balanced relevance/speed
 * - /contents uses `urls` + `highlights` for fetch
 *
 * @module
 */
import { providerError, throwIfHttp } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";
export const EXA_META = {
    name: "exa",
    label: "Exa",
    description: "Semantic / neural web search",
    credSuffix: "EXA",
    fetchCapable: true,
    needsBaseUrl: false,
};
export const ExaProvider = {
    ...EXA_META,
    async search(query, maxResults, apiKey, _baseUrl, signal) {
        if (!apiKey)
            throw providerError("config", "Exa API key is not configured");
        const res = await fetchWithProxy(EXA_SEARCH_URL, {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": apiKey },
            body: JSON.stringify({
                query,
                type: "auto",
                numResults: maxResults,
                contents: { highlights: true },
            }),
            signal,
        });
        throwIfHttp("Exa", res);
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
            // highlights[] is the query-relevant excerpt (recommended over text)
            if (Array.isArray(r.highlights) && r.highlights.length > 0) {
                s.snippet = r.highlights.filter((h) => typeof h === "string").join(" ").slice(0, 500);
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
            headers: { "content-type": "application/json", "x-api-key": apiKey },
            body: JSON.stringify({ urls: [url], highlights: true }),
            signal,
        });
        throwIfHttp("Exa", res);
        const data = await res.json();
        const result = data?.results?.[0];
        // Exa returns `highlights` (query-relevant excerpts) for token efficiency;
        // fall back to `text` when highlights absent (e.g. /contents without query).
        const highlights = Array.isArray(result?.highlights) ? result.highlights : [];
        const text = typeof result?.text === "string" ? result.text : "";
        const content = highlights.length > 0 ? highlights.join("\n\n") : text;
        if (!content)
            throw providerError("server", `Exa returned no content for ${url}`);
        return { text: content };
    },
};
