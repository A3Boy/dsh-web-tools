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
/** One provider's transient health record. */
export interface ProviderHealthEntry {
    /** Absolute epoch ms before which the provider must not be called. */
    retryAfterUntil: number;
    /** Failure that started the cooldown (diagnostics only). */
    lastFailureCode?: string;
}
/** Injectable clock + storage seam so tests never sleep. */
export interface ProviderHealthClock {
    now: () => number;
}
/** The runtime health surface shared by search + fetch executors. */
export interface ProviderHealthStore {
    /** Record a server-requested cooldown (from Retry-After). */
    setCooldown(provider: string, until: number, failureCode?: string): void;
    /** Record a cooldown as a duration from the store's own clock. */
    cooldownFor(provider: string, retryAfterMs: number, failureCode?: string): void;
    /** True when the provider must not be called at this instant. */
    isCoolingDown(provider: string, nowMs?: number): boolean;
    /** When the current cooldown expires (undefined when none). */
    cooldownUntil(provider: string): number | undefined;
    /** Read-only snapshot for diagnostics / UI. */
    snapshot(): Record<string, ProviderHealthEntry>;
    /** Clear all cooldowns (used on credential/config change). */
    clear(): void;
}
export declare function createProviderHealthStore(clock?: ProviderHealthClock): ProviderHealthStore;
