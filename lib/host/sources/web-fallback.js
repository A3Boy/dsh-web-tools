/**
 * dsh-web-tools — Specialized Source Web Fallback.
 *
 * When native browser session is not connected, authenticated, or encounters
 * rate-limits/DOM shifts, seamlessly degrade to General Web Search via the existing
 * Provider Runtime using targeted domain constraints (site:xiaohongshu.com or site:x.com).
 *
 * @module
 */
/**
 * Format a fallback search query targeted to the specific platform.
 */
export function buildFallbackQuery(platform, query) {
    const cleanQ = query.trim();
    if (platform === "xiaohongshu") {
        // If the query already has site:xiaohongshu.com, keep it
        if (/site:xiaohongshu\.com/i.test(cleanQ))
            return cleanQ;
        return `site:xiaohongshu.com ${cleanQ}`;
    }
    else if (platform === "x") {
        if (/site:(?:x\.com|twitter\.com)/i.test(cleanQ))
            return cleanQ;
        return `(site:x.com OR site:twitter.com) ${cleanQ}`;
    }
    return cleanQ;
}
/**
 * Execute degraded web fallback for a platform search using the general web search provider.
 */
export async function fallbackSearchToGeneralWeb(platform, request, generalSearch, signal) {
    const start = Date.now();
    const fallbackQuery = buildFallbackQuery(platform, request.query);
    try {
        const outcome = await generalSearch.search({
            query: fallbackQuery,
            maxResults: request.maxResults,
        }, signal);
        // Append evidence notice that this is a degraded web index fallback
        const sources = (outcome.sources ?? []).map((s) => ({
            ...s,
            snippet: s.snippet ? `[Web-index fallback; not native platform search] ${s.snippet}` : undefined,
        }));
        return {
            id: platform,
            mode: "degraded-web",
            sources,
            latencyMs: Date.now() - start,
            diagnostics: {
                degraded: true,
                fallbackQuery,
            },
        };
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
            id: platform,
            mode: "degraded-web",
            sources: [],
            latencyMs: Date.now() - start,
            error: errorMsg,
            diagnostics: {
                degraded: true,
                fallbackQuery,
            },
        };
    }
}
/**
 * Execute degraded web fallback for a platform fetch using the general web fetch provider.
 */
export async function fallbackFetchToGeneralWeb(platform, url, generalFetch, signal) {
    const start = Date.now();
    try {
        const outcome = await generalFetch.fetch({ url }, signal);
        return {
            id: platform,
            mode: "degraded-web",
            url,
            text: outcome.body?.content,
            latencyMs: Date.now() - start,
        };
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
            id: platform,
            mode: "degraded-web",
            url,
            latencyMs: Date.now() - start,
            error: errorMsg,
        };
    }
}
