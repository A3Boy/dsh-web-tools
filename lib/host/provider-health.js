/**
 * dsh-web-tools — host-scoped Provider runtime health (cooldown layer).
 *
 * Minimal first version per the P5.1 decision: only provider-scoped
 * Retry-After cooldown. Not a circuit breaker, no failure windows, no
 * half-open state — those come later with data. State is host-scoped and
 * in-memory only (process restart is fine to lose it).
 *
 * Invariants:
 *  - cooldown is per PROVIDER, never per key: 429 is often team/account-wide
 *    (Firecrawl explicitly), so rotating keys is not the answer.
 *  - auth/abort never write cooldown (registry handles those paths).
 *  - cooldown does NOT change fallbackOrder — it only degrades availability.
 * @module
 */
export function createProviderHealthStore(clock = { now: () => Date.now() }) {
    const entries = new Map();
    return {
        setCooldown(provider, until, failureCode) {
            entries.set(provider, { retryAfterUntil: until, ...(failureCode ? { lastFailureCode: failureCode } : {}) });
        },
        cooldownFor(provider, retryAfterMs, failureCode) {
            entries.set(provider, { retryAfterUntil: clock.now() + retryAfterMs, ...(failureCode ? { lastFailureCode: failureCode } : {}) });
        },
        isCoolingDown(provider, nowMs = clock.now()) {
            const entry = entries.get(provider);
            if (!entry)
                return false;
            // Expired entries are dropped lazily on read — no timer bookkeeping.
            if (nowMs >= entry.retryAfterUntil) {
                entries.delete(provider);
                return false;
            }
            return true;
        },
        cooldownUntil(provider) {
            const entry = entries.get(provider);
            return entry && entry.retryAfterUntil > clock.now() ? entry.retryAfterUntil : undefined;
        },
        snapshot() {
            const now = clock.now();
            const out = {};
            for (const [name, entry] of entries) {
                if (entry.retryAfterUntil > now)
                    out[name] = entry;
            }
            return out;
        },
        clear() {
            entries.clear();
        },
    };
}
