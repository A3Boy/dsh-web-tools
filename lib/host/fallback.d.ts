/**
 * dsh-web-tools — deterministic fallback policy (pure logic).
 *
 * Retryable failures trigger fallback to the next provider in order:
 *   429 (rate limit), 408 (timeout), 5xx, network unavailable, provider
 *   unavailable, caller timeout, AND auth failures (401/403): a bad key on
 *   one provider should not block the user's search — the key is marked
 *   unhealthy and the UI shows an auth error, but the search continues.
 * Non-retryable (never fall back): 400 invalid query, schema/config bugs,
 * programming errors — silently switching would hide broken configuration.
 * Terminal: caller cancellation (aborted) — the whole chain must stop
 * immediately, never continue to the next provider.
 * @module
 */
/** Error kinds the fallback treats as retryable. */
export declare const RETRYABLE: Set<string>;
/** Error kinds that never trigger fallback. */
export declare const NON_RETRYABLE: Set<string>;
/** Error kinds that terminate the whole chain (caller cancellation). */
export declare const TERMINAL: Set<string>;
/**
 * Classify a provider failure.
 * @param opts
 * @param opts.code machine code from the provider adapter.
 * @returns {"retryable"|"non-retryable"|"terminal"}
 */
export declare function classifyFailure(opts: {
    code: string;
}): "retryable" | "non-retryable" | "terminal";
/**
 * Compute the fallback chain for one operation: the default provider first,
 * then every configured fallback entry in order (deduped). No artificial cap —
 * the user configures the chain; total time is bounded by the attempt timeout
 * and the DSH tool-level timeout.
 */
export declare function fallbackChain(opts: {
    defaultProvider: string;
    fallbackOrder: string[];
}): string[];
/**
 * Deterministic decision record for one search attempt.
 */
export declare function attemptRecord(opts: {
    provider: string;
    attempt: number;
    outcome: "retryable" | "non-retryable" | "terminal" | "success";
    latencyMs?: number;
}): {
    provider: string;
    attempt: number;
    outcome: string;
    latencyMs?: number;
};
