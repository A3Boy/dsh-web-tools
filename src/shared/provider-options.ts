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

export interface ProviderOptionsMap {
  exa: ExaProviderOptions;
  tavily: TavilyProviderOptions;
  brave: BraveProviderOptions;
  you: YouProviderOptions;
  firecrawl: FirecrawlProviderOptions;
  parallel: ParallelProviderOptions;
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
