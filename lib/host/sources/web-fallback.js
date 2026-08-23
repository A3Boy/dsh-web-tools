import { extractSearchHints } from "../search-hints.js";
export function buildFallbackQuery(query, platform) {
    const hints = extractSearchHints(query);
    const clean = hints.cleanQuery || query;
    if (platform === "xiaohongshu") {
        return `site:xiaohongshu.com ${clean}`;
    }
    if (platform === "x") {
        return `(site:x.com OR site:twitter.com) ${clean}`;
    }
    return clean;
}
export async function fallbackSearchToGeneralWeb(query, platform, generalSearch, maxResults, signal) {
    if (!generalSearch) {
        return {
            items: [],
            error: {
                code: "runtime-unavailable",
                message: `Platform source ${platform} is unavailable and no general search provider is configured`,
                retryable: false,
            },
            retrievalMode: "degraded-web",
        };
    }
    const fallbackQuery = buildFallbackQuery(query, platform);
    try {
        const rawResults = await generalSearch.search({ query: fallbackQuery, maxResults }, signal);
        const items = (rawResults.sources || []).map((r, idx) => ({
            id: r.url || String(idx),
            title: r.title || r.url,
            url: r.url,
            snippet: r.snippet,
            platform,
        }));
        return {
            items,
            retrievalMode: "degraded-web",
        };
    }
    catch (err) {
        return {
            items: [],
            error: {
                code: "network",
                message: err?.message || "General web search fallback failed",
                retryable: true,
            },
            retrievalMode: "degraded-web",
        };
    }
}
export async function fallbackFetchToGeneralWeb(url, generalFetch, signal) {
    if (!generalFetch) {
        return {
            error: {
                code: "runtime-unavailable",
                message: "Platform fetch failed and no general fetch provider is configured",
                retryable: false,
            },
            retrievalMode: "degraded-web",
        };
    }
    try {
        const res = await generalFetch.fetch({ url }, signal);
        return {
            item: {
                id: url,
                title: "Web Page",
                url,
                text: res.body?.content || "",
                platform: "general",
            },
            retrievalMode: "degraded-web",
        };
    }
    catch (err) {
        return {
            error: {
                code: "network",
                message: err?.message || "General web fetch fallback failed",
                retryable: true,
            },
            retrievalMode: "degraded-web",
        };
    }
}
