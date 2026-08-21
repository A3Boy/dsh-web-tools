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
export type SearchStrategy = "recommended" | "fast" | "quality" | "cheap" | "custom";
/** One strategy's effect: per-provider option overrides + preferred order. */
export interface StrategyPreset {
    providerOptions: Record<string, Record<string, unknown>>;
    /** Preferred search order (default provider first). */
    order?: string[];
}
/**
 * Preset map. Recommended keeps provider defaults (empty overrides) so the
 * runtime decides; the other modes tune the known levers:
 *  - fast   → low-latency modes (Brave, Parallel turbo, Exa fast, Tavily fast)
 *  - quality→ deep/explicit retrieval (Exa deep-lite, Tavily advanced, You
 *             highlights, Jina ReaderLM-v2)
 *  - cheap  → budget-first (Brave, Parallel basic, Exa auto)
 */
export declare const STRATEGY_PRESETS: Record<Exclude<SearchStrategy, "custom">, StrategyPreset>;
/** Human order for the strategy picker (excludes custom — always last). */
export declare const STRATEGY_IDS: Array<Exclude<SearchStrategy, "custom">>;
