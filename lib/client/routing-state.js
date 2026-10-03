/**
 * Merge a routing write's authoritative result into the current view.
 * @param config - Current view; `null` (still loading) is returned unchanged.
 * @param result - The write response carrying the new order.
 * @returns The next view with the new routing fields applied.
 */
export function applyRoutingResult(config, result) {
    if (config === null)
        return config;
    return {
        ...config,
        searchRoutingPolicy: result.policy,
        defaultProvider: result.defaultProvider,
        fallbackOrder: result.fallbackOrder,
    };
}
/**
 * Whether a completed read identified by `seq` may still be applied.
 * @param seq - Sequence number the read received when it started.
 * @param appliedSeq - Sequence number of the newest read already applied.
 * @returns True when no newer read has been applied yet.
 */
export function shouldApplyRead(seq, appliedSeq) {
    return seq >= appliedSeq;
}
/** Create an isolated read sequencer (one per mounted section instance). */
export function createReadSequencer() {
    let started = 0;
    let applied = 0;
    return {
        begin: () => ++started,
        accept(seq) {
            if (!shouldApplyRead(seq, applied))
                return false;
            applied = seq;
            return true;
        },
    };
}
