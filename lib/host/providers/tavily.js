/**
 * dsh-web-tools — Tavily provider adapter.
 * Uses Tavily's REST API (POST https://api.tavily.com/search and /extract).
 * @module
 */
import { providerError, throwIfHttp } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";
export const TAVILY_META = {
    name: "tavily",
    label: "Tavily",
    description: "AI-optimized web search",
    credSuffix: "TAVILY",
    fetchCapable: true,
    needsBaseUrl: false,
};
export const TavilyProvider = {
    ...TAVILY_META,
    async search(query, maxResults, apiKey, _baseUrl, signal) {
        if (!apiKey)
            throw providerError("config", "Tavily API key is not configured");
        const res = await fetchWithProxy(TAVILY_SEARCH_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
            signal,
        });
        throwIfHttp("Tavily", res);
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
            if (typeof r.content === "string" && r.content)
                s.snippet = r.content;
            if (typeof r.published_date === "string" && r.published_date)
                s.publishedAt = r.published_date;
            return s;
        })
            .filter((x) => x !== null);
        const outcome = { sources };
        if (typeof raw?.answer === "string" && raw.answer)
            outcome.content = raw.answer;
        return outcome;
    },
    async fetch(url, apiKey, _baseUrl, signal) {
        if (!apiKey)
            throw providerError("config", "Tavily API key is not configured");
        const res = await fetchWithProxy(TAVILY_EXTRACT_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ urls: [url] }),
            signal,
        });
        throwIfHttp("Tavily", res);
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
