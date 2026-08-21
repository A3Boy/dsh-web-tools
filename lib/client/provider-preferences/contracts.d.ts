/**
 * dsh-web-tools — Provider-native option contracts.
 *
 * Pure data + predicates defining the valid option values for each provider's
 * UI controls. These are extracted from ProviderPreferencesSection.tsx so
 * unit tests can verify the contracts without a DOM environment.
 * @module
 */
/** Brave context_threshold_mode values accepted by the API. */
export declare const BRAVE_THRESHOLD_OPTIONS: readonly ["strict", "balanced", "lenient", "disabled"];
/** Brave context_threshold_mode UI labels (zh). */
export declare const BRAVE_THRESHOLD_LABELS_ZH: readonly ["严格", "平衡", "宽松", "关闭"];
/** Brave context_token_budget presets in ascending order. */
export declare const BRAVE_TOKEN_BUDGET_PRESETS: readonly [4096, 8192, 16384, 32768];
/** Brave endpoint preference modes. */
export declare const BRAVE_ENDPOINT_OPTIONS: readonly ["auto", "llm-context", "web-search"];
/** Parallel primary UI modes (stable, always available). */
export declare const PARALLEL_PRIMARY_MODES: readonly ["advanced", "basic"];
/** Parallel experimental modes (compatible but not primary). */
export declare const PARALLEL_EXPERIMENTAL_MODES: readonly ["fast", "turbo"];
/** All Parallel modes accepted by the adapter. */
export declare const PARALLEL_ALL_MODES: readonly ["advanced", "basic", "fast", "turbo"];
/** Tavily search depth options. */
export declare const TAVILY_DEPTH_OPTIONS: readonly ["basic", "advanced", "fast", "ultra-fast"];
/** Whether chunks_per_source should be shown for a given Tavily depth and autoParams state. */
export declare function tavilyChunksVisible(depth: string, autoParams: boolean): boolean;
/** Exa search type options. */
export declare const EXA_SEARCH_TYPE_OPTIONS: readonly ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"];
/** Map an Exa mode to its SIMPLE (primary) UI bucket. */
export declare function exaPrimaryMode(mode: string): "auto" | "fast" | "deep";
/**
 * Lossless primary-mode guard: clicking "深入" must never overwrite an
 * existing precise deep variant (deep-lite / deep / deep-reasoning) with
 * plain "deep". The precise value is only changeable in the native picker.
 */
export declare function exaPrimaryApplyable(v: string, currentMode: string): boolean;
/** You.com extraction mode options. */
export declare const YOU_EXTRACTION_MODE_OPTIONS: readonly ["highlights", "none"];
/** Firecrawl fetch options. */
export declare const FIRECRAWL_FETCH_OPTIONS: {
    readonly onlyMainContent: true;
    readonly maxAgeMs: 172800000;
};
/** Jina engine options. */
export declare const JINA_ENGINE_OPTIONS: readonly ["auto", "curl", "browser"];
