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
 * Project a local ordering intent into the routing fields a write carries.
 *
 * Used to paint the new order the instant the user acts: the DSH settings write
 * edits the profile patch and recomposes, which measures in SECONDS, so waiting
 * for the response makes the control feel dead.
 * @param ordered - The intended order; duplicates are dropped, keeping first.
 * @param policy - The routing policy to persist alongside it.
 * @returns The routing fields, shaped like the write response.
 */
export function routingFields(ordered, policy) {
    const next = ordered.filter((name, index) => ordered.indexOf(name) === index);
    return {
        saved: true,
        policy,
        defaultProvider: next[0],
        fallbackOrder: next.slice(1),
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
