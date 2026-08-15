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
 * @module
 */

/** Error kinds the fallback treats as retryable. */
export const RETRYABLE = new Set(["rate-limit", "timeout", "server", "network", "unavailable", "aborted", "auth"]);

/** Error kinds that never trigger fallback. */
export const NON_RETRYABLE = new Set(["bad-request", "config"]);

/**
 * Classify a provider failure.
 * @param opts
 * @param opts.code machine code from the provider adapter.
 * @returns {"retryable"|"non-retryable"}
 */
export function classifyFailure(opts: { code: string }): "retryable" | "non-retryable" {
  const { code } = opts;
  if (RETRYABLE.has(code)) return "retryable";
  if (NON_RETRYABLE.has(code)) return "non-retryable";
  // unknown codes are treated as retryable (conservative: try the next provider)
  return "retryable";
}

/**
 * Compute the fallback chain for one search.
 */
export function fallbackChain(opts: {
  defaultProvider: string;
  fallbackOrder: string[];
  maxFallbackProviders: number;
}): string[] {
  const { defaultProvider, fallbackOrder, maxFallbackProviders } = opts;
  const chain = [defaultProvider];
  const seen = new Set(chain);
  for (const name of fallbackOrder ?? []) {
    if (seen.has(name)) continue;
    seen.add(name);
    chain.push(name);
  }
  return chain.slice(0, 1 + Math.max(0, maxFallbackProviders ?? 2));
}

/**
 * Deterministic decision record for one search attempt.
 */
export function attemptRecord(opts: {
  provider: string;
  attempt: number;
  outcome: "retryable" | "non-retryable" | "success";
  latencyMs?: number;
}): { provider: string; attempt: number; outcome: string; latencyMs?: number } {
  const { provider, attempt, outcome, latencyMs } = opts;
  return {
    provider,
    attempt,
    outcome,
    ...(latencyMs !== undefined ? { latencyMs } : {}),
  };
}
