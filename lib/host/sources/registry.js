/**
 * dsh-web-tools — Specialized Source Registry & Router.
 *
 * Coordinates platform sources (Xiaohongshu, X) and manages routing from
 * DSH web_search and web_fetch calls.
 *
 * Decision flow:
 * 1. web_search(query) -> extractSearchHints(query).
 * 2. If hints.platform is detected AND corresponding source is enabled:
 *    - If source is authenticated via Bridge, execute native platform search.
 *    - If source not authenticated or encounters error, execute degraded web fallback.
 * 3. If hints.platform is NOT detected, execute standard general multi-provider search.
 *
 * @module
 */
import { fallbackSearchToGeneralWeb, fallbackFetchToGeneralWeb } from "./web-fallback.js";
import { extractSearchHints } from "../search-hints.js";
export class SpecializedSourceRegistry {
    sources = new Map();
    enabledSources = new Set(["xiaohongshu", "x"]);
    allowDegradedFallback = true;
    register(source) {
        this.sources.set(source.id, source);
    }
    get(id) {
        return this.sources.get(id);
    }
    setEnabled(id, enabled) {
        if (enabled) {
            this.enabledSources.add(id);
        }
        else {
            this.enabledSources.delete(id);
        }
    }
    isEnabled(id) {
        return this.enabledSources.has(id);
    }
    setAllowDegradedFallback(allow) {
        this.allowDegradedFallback = allow;
    }
    /**
     * Probe all registered sources.
     */
    async probeAll() {
        const statuses = [];
        for (const [id, source] of this.sources.entries()) {
            try {
                const status = await source.probe();
                statuses.push({
                    ...status,
                    enabled: this.isEnabled(id),
                });
            }
            catch (err) {
                statuses.push({
                    id,
                    enabled: this.isEnabled(id),
                    bridgeConnected: false,
                    authenticated: false,
                    lastError: err instanceof Error ? err.message : String(err),
                    lastCheckedAt: Date.now(),
                });
            }
        }
        return statuses;
    }
    /**
     * Determine whether a URL belongs to a specialized platform.
     */
    matchPlatformUrl(url) {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.toLowerCase();
            if (host.includes("xiaohongshu.com") || host.includes("xhslink.com")) {
                return "xiaohongshu";
            }
            if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
                return "x";
            }
        }
        catch {
            // Invalid URL, no platform match
        }
        return undefined;
    }
    /**
     * Route a web_search request to a specialized source if applicable,
     * or fall back to the general web search provider.
     */
    async routeSearch(request, generalSearch, signal) {
        const hints = extractSearchHints(request.query);
        const platform = hints.platform;
        if (platform && this.isEnabled(platform)) {
            const source = this.get(platform);
            const searchReq = {
                query: hints.cleanQuery || request.query,
                maxResults: request.maxResults,
                hints,
            };
            if (source) {
                try {
                    const status = await source.probe();
                    if (status.authenticated && status.bridgeConnected) {
                        const nativeOutcome = await source.search(searchReq, signal);
                        if (!nativeOutcome.error && nativeOutcome.sources.length > 0) {
                            return {
                                sources: nativeOutcome.sources,
                                truncated: false,
                                backend: `source:${platform}`,
                                attempts: [{
                                        provider: `source:${platform}`,
                                        outcome: "ok",
                                        latencyMs: nativeOutcome.latencyMs,
                                        sourcesFound: nativeOutcome.sources.length,
                                    }],
                            };
                        }
                    }
                }
                catch {
                    // Source error; proceed to degraded fallback if permitted
                }
            }
            // If native search was unavailable or yielded error, check if fallback is allowed
            if (this.allowDegradedFallback) {
                const fallbackOutcome = await fallbackSearchToGeneralWeb(platform, searchReq, generalSearch, signal);
                return {
                    sources: fallbackOutcome.sources,
                    truncated: false,
                    backend: `fallback:${platform}`,
                    attempts: [{
                            provider: `fallback:${platform}`,
                            outcome: fallbackOutcome.error ? "server-error" : "ok",
                            latencyMs: fallbackOutcome.latencyMs,
                            sourcesFound: fallbackOutcome.sources.length,
                            error: fallbackOutcome.error,
                        }],
                };
            }
        }
        // Default: route directly to general web search provider
        const outcome = await generalSearch.search(request, signal);
        return {
            ...outcome,
        };
    }
    /**
     * Route a web_fetch request to a specialized source if applicable,
     * or fall back to the general web fetch provider.
     */
    async routeFetch(url, generalFetch, signal) {
        const platform = this.matchPlatformUrl(url);
        if (platform && this.isEnabled(platform)) {
            const source = this.get(platform);
            if (source) {
                try {
                    const status = await source.probe();
                    if (status.authenticated && status.bridgeConnected) {
                        const nativeOutcome = await source.fetch(url, signal);
                        if (!nativeOutcome.error && (nativeOutcome.text || nativeOutcome.title)) {
                            return {
                                url,
                                statusCode: 200,
                                body: { kind: "text", content: nativeOutcome.text ?? nativeOutcome.title ?? "" },
                                truncated: false,
                            };
                        }
                    }
                }
                catch {
                    // Fall through to general fetch
                }
            }
            if (this.allowDegradedFallback) {
                const fallbackOutcome = await fallbackFetchToGeneralWeb(platform, url, generalFetch, signal);
                return {
                    url,
                    statusCode: 200,
                    body: { kind: "text", content: fallbackOutcome.text ?? "" },
                    truncated: false,
                };
            }
        }
        return generalFetch.fetch({ url }, signal);
    }
}
import { defaultXiaohongshuSource } from "./xiaohongshu.js";
import { defaultXSource } from "./x.js";
/** Global singleton registry */
export const defaultSourceRegistry = new SpecializedSourceRegistry();
defaultSourceRegistry.register(defaultXiaohongshuSource);
defaultSourceRegistry.register(defaultXSource);
