/**
 * dsh-web-tools — Provider-native option contracts.
 *
 * Pure data + predicates defining the valid option values for each provider's
 * UI controls. These are extracted from ProviderPreferencesSection.tsx so
 * unit tests can verify the contracts without a DOM environment.
 * @module
 */

/** Brave context_threshold_mode values accepted by the API. */
export const BRAVE_THRESHOLD_OPTIONS = ["strict", "balanced", "lenient", "disabled"] as const;

/** Brave context_threshold_mode UI labels (zh). */
export const BRAVE_THRESHOLD_LABELS_ZH = ["严格", "平衡", "宽松", "关闭"] as const;

/** Brave context_token_budget presets in ascending order. */
export const BRAVE_TOKEN_BUDGET_PRESETS = [4096, 8192, 16384, 32768] as const;

/** Brave endpoint preference modes. */
export const BRAVE_ENDPOINT_OPTIONS = ["auto", "llm-context", "web-search"] as const;

/** Parallel primary UI modes (stable, always available). */
export const PARALLEL_PRIMARY_MODES = ["advanced", "basic"] as const;

/** Parallel experimental modes (compatible but not primary). */
export const PARALLEL_EXPERIMENTAL_MODES = ["fast", "turbo"] as const;

/** All Parallel modes accepted by the adapter. */
export const PARALLEL_ALL_MODES = [...PARALLEL_PRIMARY_MODES, ...PARALLEL_EXPERIMENTAL_MODES] as const;

/** Tavily search depth options. */
export const TAVILY_DEPTH_OPTIONS = ["basic", "advanced", "fast", "ultra-fast"] as const;

/** Whether chunks_per_source should be shown for a given Tavily depth and autoParams state. */
export function tavilyChunksVisible(depth: string, autoParams: boolean): boolean {
  return depth === "advanced" && !autoParams;
}

/** Exa search type options. */
export const EXA_SEARCH_TYPE_OPTIONS = ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"] as const;

/** Map an Exa mode to its SIMPLE (primary) UI bucket. */
export function exaPrimaryMode(mode: string): "auto" | "fast" | "deep" {
  if (mode === "auto") return "auto";
  if (mode === "fast" || mode === "instant") return "fast";
  return "deep";
}

/**
 * Lossless primary-mode guard: clicking "深入" must never overwrite an
 * existing precise deep variant (deep-lite / deep / deep-reasoning) with
 * plain "deep". The precise value is only changeable in the native picker.
 */
export function exaPrimaryApplyable(v: string, currentMode: string): boolean {
  if (v === "deep" && currentMode.startsWith("deep")) return false;
  return true;
}

/** You.com extraction mode options. */
export const YOU_EXTRACTION_MODE_OPTIONS = ["highlights", "none"] as const;

/** Firecrawl fetch options. */
export const FIRECRAWL_FETCH_OPTIONS = { onlyMainContent: true, maxAgeMs: 172800000 } as const;

/** Jina engine options. */
export const JINA_ENGINE_OPTIONS = ["auto", "curl", "browser"] as const;