/**
 * dsh-web-tools — settings-state application helpers.
 *
 * Extracted as pure functions so the two policies behind the "edit applies but
 * the page does not repaint" defect are unit-testable without a DOM:
 *
 * 1. A routing write already returns the authoritative new order, so the UI
 *    must paint from that response instead of waiting for a follow-up read-back.
 * 2. A settings read may be discarded only when a NEWER read has already been
 *    APPLIED. Discarding merely because a newer read STARTED loses updates: the
 *    newer read may itself be discarded, leaving the page stale until reopened.
 * @module
 */
import type { ConfigView, SearchRoutingPolicy } from "../shared/api-types.ts";
/** The authoritative result a routing write returns. */
export interface RoutingWriteResult {
    saved: boolean;
    policy: SearchRoutingPolicy;
    defaultProvider: string;
    fallbackOrder: string[];
}
/**
 * Merge a routing write's authoritative result into the current view.
 * @param config - Current view; `null` (still loading) is returned unchanged.
 * @param result - The write response carrying the new order.
 * @returns The next view with the new routing fields applied.
 */
export declare function applyRoutingResult(config: ConfigView | null, result: RoutingWriteResult): ConfigView | null;
/**
 * Project a local ordering intent into the routing fields a write carries.
 *
 * Used to paint the new order the instant the user acts: the DSH settings write
 * edits the profile patch and recomposes, which measures in SECONDS, so waiting
 * for the response makes the control feel dead.
 * @param ordered - The intended order; duplicates are dropped, keeping first.
 * @param policy - The routing policy to persist alongside it.
 * @returns The routing fields, shaped like the write response.
 */
export declare function routingFields(ordered: readonly string[], policy: SearchRoutingPolicy): RoutingWriteResult;
/**
 * Whether a completed read identified by `seq` may still be applied.
 * @param seq - Sequence number the read received when it started.
 * @param appliedSeq - Sequence number of the newest read already applied.
 * @returns True when no newer read has been applied yet.
 */
export declare function shouldApplyRead(seq: number, appliedSeq: number): boolean;
/** Sequence bookkeeping for in-flight settings reads. */
export interface ReadSequencer {
    /** Allocate the next read sequence number. */
    begin: () => number;
    /**
     * Claim the right to apply a completed read.
     * @returns False when it must be dropped (a newer read already applied).
     */
    accept: (seq: number) => boolean;
}
/** Create an isolated read sequencer (one per mounted section instance). */
export declare function createReadSequencer(): ReadSequencer;
