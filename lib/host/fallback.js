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
export const RETRYABLE = new Set(["rate-limit", "timeout", "server", "network", "unavailable", "auth"]);
/** Error kinds that never trigger fallback. */
export const NON_RETRYABLE = new Set(["bad-request", "config"]);
/** Error kinds that terminate the whole chain (caller cancellation). */
export const TERMINAL = new Set(["aborted"]);
/**
 * Classify a provider failure.
 * @param opts
 * @param opts.code machine code from the provider adapter.
 * @returns {"retryable"|"non-retryable"|"terminal"}
 */
export function classifyFailure(opts) {
    const { code } = opts;
    if (TERMINAL.has(code))
        return "terminal";
    if (RETRYABLE.has(code))
        return "retryable";
    if (NON_RETRYABLE.has(code))
        return "non-retryable";
    // unknown codes are treated as retryable (conservative: try the next provider)
    return "retryable";
}
/**
 * Compute the fallback chain for one operation: the default provider first,
 * then every configured fallback entry in order (deduped). No artificial cap —
 * the user configures the chain; total time is bounded by the attempt timeout
 * and the DSH tool-level timeout.
 */
export function fallbackChain(opts) {
    const { defaultProvider, fallbackOrder } = opts;
    const chain = [defaultProvider];
    const seen = new Set(chain);
    for (const name of fallbackOrder ?? []) {
        if (seen.has(name))
            continue;
        seen.add(name);
        chain.push(name);
    }
    return chain;
}
/**
 * Deterministic decision record for one search attempt.
 */
export function attemptRecord(opts) {
    const { provider, attempt, outcome, latencyMs } = opts;
    return {
        provider,
        attempt,
        outcome,
        ...(latencyMs !== undefined ? { latencyMs } : {}),
    };
}
