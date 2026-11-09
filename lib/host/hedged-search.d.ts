/**
 * dsh-web-tools — Hedged & Multi-Source Parallel Search Execution.
 *
 * Implements Google-style hedged requests (Dean & Barroso, 2013 "The Tail at Scale")
 * and dual-provider parallel fusion for "Deep" search mode:
 *
 * 1. Hedged mode:
 *    - Dispatches to Provider 1.
 *    - If Provider 1 does not settle within `hedgeDelayMs` (default 1200ms),
 *      launches Provider 2 concurrently without cancelling Provider 1.
 *    - The first successful response resolves the request, or if both settle
 *      within budget, their results are fused using RRF.
 *
 * 2. Deep mode:
 *    - Dispatches simultaneously to up to `fanout` providers (default 2).
 *    - Combines all successful result sets via `reciprocalRankFusion`.
 * @module
 */
import type { Source } from "./providers/types.ts";
import { type FusedSource } from "./fusion.ts";
export interface ProviderSearchFn {
    (providerName: string, signal: AbortSignal): Promise<{
        sources: Source[];
    }>;
}
export interface HedgedSearchOptions {
    /** Maximum delay before launching the hedged secondary request (ms). Default: 1200ms. */
    hedgeDelayMs?: number;
    /** Overall attempt budget (ms). Default: 6000ms. */
    timeoutMs?: number;
    /** Caller cancellation signal. */
    signal?: AbortSignal;
}
export interface HedgedSearchResult {
    sources: FusedSource[] | Source[];
    backend: string;
    hedgedLaunched: boolean;
    attempts: Array<{
        provider: string;
        latencyMs: number;
        status: "success" | "empty" | "error";
    }>;
}
/**
 * Execute a hedged search request across two candidates.
 */
export declare function runHedgedSearch(providers: [string, string], searchFn: ProviderSearchFn, options?: HedgedSearchOptions): Promise<HedgedSearchResult>;
