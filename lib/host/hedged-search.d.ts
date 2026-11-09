/**
 * dsh-web-tools — cross-provider retrieval orchestration.
 *
 * Two strategies sit on top of the single-provider executor:
 *
 * 1. hedged (Dean & Barroso, "The Tail at Scale"):
 *    - Start the primary lane.
 *    - If it is still running after `hedgeDelayMs`, start a second lane in
 *      parallel. The FIRST success wins and the loser is ABORTED, so the
 *      cancelled request stops consuming quota instead of running to
 *      completion in the background.
 *    - If the primary settles first, the hedge never launches.
 *
 * 2. fused:
 *    - Start both lanes immediately and wait for both.
 *    - Merge their ranked lists with Reciprocal Rank Fusion (wider recall,
 *      roughly double the provider cost — hence opt-in).
 *
 * Lanes are independent: each has its own AbortController linked to the
 * caller's signal and to one overall deadline, so cancelling one lane can
 * never cancel the other.
 * @module
 */
import type { Source } from "./providers/types.ts";
/** Which lane a provider call belongs to. */
export type LaneRole = "primary" | "secondary";
/** One provider call as the executor sees it. */
export interface ProviderSearchFn {
    (providerName: string, signal: AbortSignal, lane: LaneRole): Promise<{
        sources: Source[];
    }>;
}
export type MultiSourceMode = "hedged" | "fused";
export interface MultiSourceOptions {
    /** "hedged" (default) = first success wins; "fused" = run both and merge. */
    mode?: MultiSourceMode;
    /** Delay before the hedged lane starts. Default: 1200ms. */
    hedgeDelayMs?: number;
    /** Overall budget for the whole multi-source attempt. Default: 6000ms. */
    timeoutMs?: number;
    /** Caller cancellation. */
    signal?: AbortSignal;
}
/** Diagnostics for one lane, in the executor's `attempts` vocabulary. */
export interface LaneAttempt {
    provider: string;
    latencyMs: number;
    outcome: string;
}
export interface MultiSourceResult {
    sources: Source[];
    /** `a` or `a+b` for a fused answer. */
    backend: string;
    /** True when the second lane was actually launched. */
    hedgedLaunched: boolean;
    /** True when two ranked lists were merged with RRF. */
    fused: boolean;
    attempts: LaneAttempt[];
}
/**
 * Run two providers under the requested strategy.
 *
 * @throws the winning lane's error when no lane produced a non-empty answer and
 *         no lane legitimately returned an empty set.
 */
export declare function runHedgedSearch(providers: [string, string], searchFn: ProviderSearchFn, options?: MultiSourceOptions): Promise<MultiSourceResult>;
