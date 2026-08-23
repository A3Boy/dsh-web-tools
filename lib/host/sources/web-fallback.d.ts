/**
 * dsh-web-tools — Specialized Source Web Fallback.
 *
 * When native browser session is not connected, authenticated, or encounters
 * rate-limits/DOM shifts, seamlessly degrade to General Web Search via the existing
 * Provider Runtime using targeted domain constraints (site:xiaohongshu.com or site:x.com).
 *
 * @module
 */
import type { SpecializedPlatformId, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome } from "./types.ts";
import type { WebSearchProviderLike, WebFetchProviderLike } from "../registry.ts";
/**
 * Format a fallback search query targeted to the specific platform.
 */
export declare function buildFallbackQuery(platform: SpecializedPlatformId, query: string): string;
/**
 * Execute degraded web fallback for a platform search using the general web search provider.
 */
export declare function fallbackSearchToGeneralWeb(platform: SpecializedPlatformId, request: SourceSearchRequest, generalSearch: WebSearchProviderLike, signal?: AbortSignal): Promise<SourceSearchOutcome>;
/**
 * Execute degraded web fallback for a platform fetch using the general web fetch provider.
 */
export declare function fallbackFetchToGeneralWeb(platform: SpecializedPlatformId, url: string, generalFetch: WebFetchProviderLike, signal?: AbortSignal): Promise<SourceFetchOutcome>;
