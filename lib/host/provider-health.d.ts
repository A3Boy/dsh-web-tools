/**
 * dsh-web-tools — host-scoped Provider runtime health (cooldown + circuit breaker).
 *
 * Two independent layers, both in-memory and host-scoped (a restart forgets them):
 *  1. Retry-After cooldown: a server-requested pause after a 429.
 *  2. Circuit breaker: after BREAKER_THRESHOLD consecutive transient failures
 *     (timeout / server / network) the provider is skipped for an exponentially
 *     growing cooldown (30s doubling, capped at 5min). When it expires exactly
 *     ONE probe request is admitted (half-open); success closes the breaker,
 *     failure re-opens it with the next, longer cooldown.
 *
 * Invariants:
 *  - cooldown and breaker are per PROVIDER, never per key.
 *  - auth / bad-request / config / aborted never count toward the breaker
 *    (a bad key or a caller cancellation says nothing about provider health).
 *  - neither layer changes fallbackOrder — they only degrade availability.
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
export type BreakerState = "closed" | "open" | "half-open";
/** What the caller may do with a provider right now. */
export interface Admission {
    state: "allow" | "probe" | "blocked";
    token: number;
}
/** Read-only breaker view for diagnostics / UI. */
export interface BreakerView {
    state: BreakerState;
    consecutiveFailures: number;
    trips: number;
    openUntil?: number;
}
/** Failure codes that count toward the breaker. */
export declare const BREAKER_TRANSIENT_CODES: ReadonlySet<string>;
export declare const BREAKER_THRESHOLD = 3;
export declare const BREAKER_BASE_COOLDOWN_MS = 30000;
export declare const BREAKER_MAX_COOLDOWN_MS = 300000;
/** A probe that never reported back is considered lost after this long. */
export declare const BREAKER_PROBE_STALE_MS = 120000;
/** Cooldown after the Nth trip: 30s, 60s, 120s, ... capped at 5min. */
export declare function breakerCooldownMs(trips: number): number;
/** The runtime health surface shared by search + fetch executors. */
export interface ProviderHealthStore {
    /** Record a server-requested cooldown (from Retry-After). */
    setCooldown(provider: string, until: number, failureCode?: string): void;
    /** Record a cooldown as a duration from the store's own clock. */
    cooldownFor(provider: string, retryAfterMs: number, failureCode?: string): void;
    /** True when a Retry-After cooldown or an open breaker forbids calling the provider. */
    isCoolingDown(provider: string, nowMs?: number): boolean;
    /** When the current Retry-After cooldown expires (undefined when none). */
    cooldownUntil(provider: string): number | undefined;
    /** Read-only snapshot of active Retry-After cooldowns. */
    snapshot(): Record<string, ProviderHealthEntry>;
    /**
     * Gate one call. `allow` = normal; `probe` = the single half-open trial
     * (the caller MUST report recordSuccess / recordFailure / releaseProbe);
     * `blocked` = skip this provider.
     */
    admit(provider: string): Admission;
    /** Count one failure; only timeout / server / network are counted. */
    recordFailure(provider: string, code: string, admission?: Admission): void;
    /** Any success closes the breaker and clears the failure streak. */
    recordSuccess(provider: string, admission?: Admission): void;
    /** Give back a probe slot without judging health (e.g. caller aborted). */
    releaseProbe(provider: string, admission?: Admission): void;
    /** When an open breaker lets the next probe through (undefined when closed). */
    breakerOpenUntil(provider: string): number | undefined;
    /** Read-only breaker view for providers that are not fully healthy. */
    breakerSnapshot(): Record<string, BreakerView>;
    /**
     * Clear ONE provider's cooldown AND breaker.
     *
     * Used when a single source's endpoint or credential changes: its old
     * state is meaningless, but every OTHER source's state is still valid
     * and must not be discarded.
     */
    deleteCooldown(provider: string): void;
    /** Clear all cooldowns and breakers (used on credential/config change). */
    clear(): void;
}
export declare function createProviderHealthStore(clock?: ProviderHealthClock): ProviderHealthStore;
