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
import type { SpecializedPlatformId, SpecializedSource, SourceStatus } from "./types.ts";
import type { WebSearchProviderLike, WebFetchProviderLike } from "../registry.ts";
export interface RoutedSearchOutcome {
    content?: string;
    sources: Array<{
        url: string;
        title?: string;
        snippet?: string;
        publishedAt?: string;
    }>;
    truncated: boolean;
    attempts?: Array<{
        provider: string;
        outcome: string;
        latencyMs?: number;
        sourcesFound?: number;
        error?: string;
    }>;
    backend?: string;
}
export interface RoutedFetchOutcome {
    url: string;
    statusCode: number;
    body: {
        kind: "html" | "text";
        content: string;
    };
    truncated: boolean;
}
export declare class SpecializedSourceRegistry {
    private sources;
    private enabledSources;
    private allowDegradedFallback;
    register(source: SpecializedSource): void;
    get(id: SpecializedPlatformId): SpecializedSource | undefined;
    setEnabled(id: SpecializedPlatformId, enabled: boolean): void;
    isEnabled(id: SpecializedPlatformId): boolean;
    setAllowDegradedFallback(allow: boolean): void;
    /**
     * Probe all registered sources.
     */
    probeAll(): Promise<SourceStatus[]>;
    /**
     * Determine whether a URL belongs to a specialized platform.
     */
    matchPlatformUrl(url: string): SpecializedPlatformId | undefined;
    /**
     * Route a web_search request to a specialized source if applicable,
     * or fall back to the general web search provider.
     */
    routeSearch(request: {
        query: string;
        maxResults?: number;
    }, generalSearch: WebSearchProviderLike, signal?: AbortSignal): Promise<RoutedSearchOutcome>;
    /**
     * Route a web_fetch request to a specialized source if applicable,
     * or fall back to the general web fetch provider.
     */
    routeFetch(url: string, generalFetch: WebFetchProviderLike, signal?: AbortSignal): Promise<RoutedFetchOutcome>;
}
/** Global singleton registry */
export declare const defaultSourceRegistry: SpecializedSourceRegistry;
