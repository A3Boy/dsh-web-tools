/**
 * dsh-web-tools — Provider-native typed execution options.
 *
 * Dedicated typed settings per provider. No universal SearchOptions.
 * @module
 */
export interface ExaProviderOptions {
    searchType?: "auto" | "fast" | "instant" | "deep-lite" | "deep" | "deep-reasoning";
    maxAgeHours?: number;
}
export interface TavilyProviderOptions {
    searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
    chunksPerSource?: 1 | 2 | 3;
    autoParameters?: boolean;
    /** Extract depth for /extract (web_fetch). */
    fetchExtractDepth?: "basic" | "advanced";
}
export interface BraveProviderOptions {
    endpointPreference?: "auto" | "llm-context" | "web-search";
    contextThresholdMode?: "strict" | "balanced" | "lenient" | "disabled";
    contextTokenBudget?: number;
}
export interface YouProviderOptions {
    extractionMode?: "highlights" | "none";
    fetchCrawlTimeoutSec?: number;
    fetchMaxAgeSec?: number;
}
export interface FirecrawlProviderOptions {
    fetchOnlyMainContent?: boolean;
    fetchMaxAgeMs?: number;
}
export interface ParallelProviderOptions {
    mode?: "turbo" | "fast" | "basic" | "advanced";
    maxCharsTotal?: number;
}
export interface JinaProviderOptions {
    /**
     * Reader page loading engine.
     * undefined / auto = Jina default.
     */
    fetchEngine?: "auto" | "curl" | "browser";
    /**
     * Max acceptable cache age in seconds.
     * undefined = Jina default. 0 = force fresh (X-No-Cache equivalent).
     */
    fetchCacheToleranceSec?: number;
    /**
     * Trim output rather than reject — the normal context-size guard.
     */
    fetchMaxTokens?: number;
    /**
     * Hard budget guard; Jina rejects the request if the page would exceed it.
     */
    fetchTokenBudget?: number;
    /**
     * Higher-quality HTML→Markdown conversion (ReaderLM-v2); ~3x Reader tokens.
     */
    fetchReaderLmV2?: boolean;
}
export interface ProviderOptionsMap {
    exa: ExaProviderOptions;
    tavily: TavilyProviderOptions;
    brave: BraveProviderOptions;
    you: YouProviderOptions;
    firecrawl: FirecrawlProviderOptions;
    parallel: ParallelProviderOptions;
    jina: JinaProviderOptions;
}
export type KnownProviderWithOptions = keyof ProviderOptionsMap;
export type StoredProviderOptions = Partial<{
    [K in keyof ProviderOptionsMap]: ProviderOptionsMap[K];
}>;
export interface ProviderOptionView<T extends object = Record<string, unknown>> {
    overrides: Partial<T>;
    effective: T;
    customized: boolean;
    isDefault: boolean;
}
