/**
 * dsh-web-tools — Search strategy presets (client-side).
 *
 * User-facing modes (推荐/快速/精准/节省) map to per-provider native option
 * overrides plus a preferred fallback order. "custom" means the operator
 * manages order and options by hand — no preset is applied.
 *
 * These are UI-level conveniences: every override is written through the same
 * `config/save` providerOptions gate, so nothing here bypasses sanitization
 * on the Host.
 * @module
 */
/**
 * Preset map. Recommended keeps provider defaults (empty overrides) so the
 * runtime decides; the other modes tune the known levers:
 *  - fast   → low-latency modes (Brave, Parallel turbo, Exa fast, Tavily fast)
 *  - quality→ deep/explicit retrieval (Exa deep-lite, Tavily advanced, You
 *             highlights, Jina ReaderLM-v2)
 *  - cheap  → budget-first (Brave, Parallel basic, Exa auto)
 */
export const STRATEGY_PRESETS = {
    recommended: {
        providerOptions: {},
    },
    fast: {
        providerOptions: {
            brave: { endpointPreference: "auto" },
            parallel: { mode: "turbo" },
            exa: { searchType: "fast" },
            tavily: { searchDepth: "fast" },
        },
        order: ["brave", "parallel", "exa", "tavily", "you", "firecrawl", "jina"],
    },
    quality: {
        providerOptions: {
            exa: { searchType: "deep-lite" },
            tavily: { searchDepth: "advanced" },
            you: { extractionMode: "highlights" },
            jina: { fetchReaderLmV2: true },
        },
        order: ["exa", "you", "tavily", "jina", "brave", "firecrawl", "parallel"],
    },
    cheap: {
        providerOptions: {
            brave: { endpointPreference: "auto" },
            parallel: { mode: "basic" },
            exa: { searchType: "auto" },
        },
        order: ["brave", "parallel", "exa", "firecrawl", "jina", "tavily", "you"],
    },
};
/** Human order for the strategy picker (excludes custom — always last). */
export const STRATEGY_IDS = ["recommended", "fast", "quality", "cheap"];
