/**
 * dsh-web-tools — Reciprocal Rank Fusion (RRF) & URL Canonicalization.
 *
 * Merges multi-engine search results into a single ranked list. RRF computes:
 *   RRF(d) = sum_{m in M} 1 / (k + rank_m(d))
 * with default constant k = 60.
 *
 * Items appearing across multiple providers or ranking high in individual
 * providers are promoted naturally, while duplicates are merged and tracking
 * parameters stripped.
 * @module
 */
import type { Source } from "./providers/types.ts";
/**
 * Canonicalize a URL for deduplication across search engines:
 *  - Lowercase scheme and hostname
 *  - Remove default ports
 *  - Strip trailing slashes on root path
 *  - Strip tracking and telemetry query params
 *  - Strip hash fragments
 */
export declare function canonicalizeUrl(rawUrl: string): string;
export interface ProviderResultSet {
    provider: string;
    sources: Source[];
}
export interface FusedSource extends Source {
    /** Aggregated Reciprocal Rank Fusion score. */
    rrfScore: number;
    /** Providers that contributed this result. */
    matchedProviders: string[];
}
/**
 * Fuse results from multiple search providers using Reciprocal Rank Fusion (RRF).
 *
 * @param resultSets array of provider outcomes with their ranked sources.
 * @param k RRF smoothing constant (default: 60).
 * @param maxResults optional cap on returned results.
 * @returns fused, deduplicated list of Sources sorted by RRF score descending.
 */
export declare function reciprocalRankFusion(resultSets: ProviderResultSet[], k?: number, maxResults?: number): FusedSource[];
