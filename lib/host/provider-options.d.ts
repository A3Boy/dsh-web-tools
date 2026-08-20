/**
 * dsh-web-tools — Host provider options normalization and validation.
 *
 * Validates and resolves effective execution options for each provider.
 * Keeps raw storage clean while providing fully-typed options to adapters.
 * @module
 */
import type { ExaProviderOptions, TavilyProviderOptions, BraveProviderOptions, YouProviderOptions, FirecrawlProviderOptions, ParallelProviderOptions, ProviderOptionView } from "../shared/provider-options.ts";
export declare const DEFAULT_EXA_OPTIONS: Required<ExaProviderOptions>;
export declare const DEFAULT_TAVILY_OPTIONS: Required<TavilyProviderOptions>;
export declare const DEFAULT_BRAVE_OPTIONS: Required<BraveProviderOptions>;
export declare const DEFAULT_YOU_OPTIONS: Required<YouProviderOptions>;
export declare const DEFAULT_FIRECRAWL_OPTIONS: Required<FirecrawlProviderOptions>;
export declare const DEFAULT_PARALLEL_OPTIONS: Required<ParallelProviderOptions>;
/** Validate options patch for a specific provider. Throws or returns sanitized options. */
export declare function sanitizeProviderOptions(provider: string, raw: Record<string, unknown>): Record<string, unknown>;
/** Build the ProviderOptionView for a provider. */
export declare function buildProviderOptionView(provider: string, overrides?: Record<string, unknown>): ProviderOptionView;
/** Resolve only the effective options map for a provider. */
export declare function resolveEffectiveOptions(provider: string, overrides?: Record<string, unknown>): Record<string, unknown>;
