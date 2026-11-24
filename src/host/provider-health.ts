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
export const BREAKER_TRANSIENT_CODES: ReadonlySet<string> = new Set(["timeout", "server", "network"]);
export const BREAKER_THRESHOLD = 3;
export const BREAKER_BASE_COOLDOWN_MS = 30_000;
export const BREAKER_MAX_COOLDOWN_MS = 300_000;
/** A probe that never reported back is considered lost after this long. */
export const BREAKER_PROBE_STALE_MS = 120_000;

/** Cooldown after the Nth trip: 30s, 60s, 120s, ... capped at 5min. */
export function breakerCooldownMs(trips: number): number {
  return Math.min(BREAKER_BASE_COOLDOWN_MS * 2 ** Math.max(0, trips - 1), BREAKER_MAX_COOLDOWN_MS);
}

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

interface BreakerRecord {
  token: number;
  failures: number;
  trips: number;
  openUntil?: number;
  probingSince?: number;
}

export function createProviderHealthStore(clock: ProviderHealthClock = { now: () => Date.now() }): ProviderHealthStore {
  const entries = new Map<string, ProviderHealthEntry>();
  const breakers = new Map<string, BreakerRecord>();
  let nextToken = 0;

  const retryAfterActive = (provider: string, nowMs: number): boolean => {
    const entry = entries.get(provider);
    if (!entry) return false;
    // Expired entries are dropped lazily on read — no timer bookkeeping.
    if (nowMs >= entry.retryAfterUntil) {
      entries.delete(provider);
      return false;
    }
    return true;
  };

  const stateOf = (rec: BreakerRecord | undefined, nowMs: number): BreakerState => {
    if (!rec || rec.openUntil === undefined) return "closed";
    return nowMs < rec.openUntil ? "open" : "half-open";
  };

  const trip = (rec: BreakerRecord, nowMs: number): void => {
    rec.token = ++nextToken;
    rec.trips += 1;
    rec.failures = 0;
    rec.openUntil = nowMs + breakerCooldownMs(rec.trips);
    rec.probingSince = undefined;
  };

  return {
    setCooldown(provider, until, failureCode) {
      entries.set(provider, { retryAfterUntil: until, ...(failureCode ? { lastFailureCode: failureCode } : {}) });
    },

    cooldownFor(provider, retryAfterMs, failureCode) {
      entries.set(provider, { retryAfterUntil: clock.now() + retryAfterMs, ...(failureCode ? { lastFailureCode: failureCode } : {}) });
    },

    isCoolingDown(provider, nowMs = clock.now()) {
      if (retryAfterActive(provider, nowMs)) return true;
      return stateOf(breakers.get(provider), nowMs) === "open";
    },

    cooldownUntil(provider) {
      const entry = entries.get(provider);
      return entry && entry.retryAfterUntil > clock.now() ? entry.retryAfterUntil : undefined;
    },

    snapshot() {
      const now = clock.now();
      const out: Record<string, ProviderHealthEntry> = {};
      for (const [name, entry] of entries) {
        if (entry.retryAfterUntil > now) out[name] = entry;
      }
      return out;
    },

    admit(provider) {
      const now = clock.now();
      if (retryAfterActive(provider, now)) return { state: "blocked", token: 0 };
      let rec = breakers.get(provider);
      if (!rec) {
        rec = { token: ++nextToken, failures: 0, trips: 0 };
        breakers.set(provider, rec);
      }
      const state = stateOf(rec, now);
      if (state === "closed") return { state: "allow", token: rec.token };
      if (state === "open") return { state: "blocked", token: rec.token };
      // half-open: exactly one probe at a time.
      if (rec.probingSince !== undefined && now - rec.probingSince < BREAKER_PROBE_STALE_MS) return { state: "blocked", token: rec.token };
      rec.probingSince = now;
      rec.token = ++nextToken;
      return { state: "probe", token: rec.token };
    },

    recordFailure(provider, code, admission) {
      if (!BREAKER_TRANSIENT_CODES.has(code)) return;
      const now = clock.now();
      let rec = breakers.get(provider);
      if (admission && admission.token !== rec?.token) return;
      if (!rec) {
        rec = { token: ++nextToken, failures: 0, trips: 0 };
        breakers.set(provider, rec);
      }
      if (rec.openUntil !== undefined) {
        // Half-open probe failed -> re-open with the next, longer cooldown.
        // A late failure from a call started before the trip is ignored.
        if (now >= rec.openUntil) trip(rec, now);
        return;
      }
      rec.failures += 1;
      if (rec.failures >= BREAKER_THRESHOLD) trip(rec, now);
    },

    recordSuccess(provider, admission) {
      const rec = breakers.get(provider);
      if (admission && admission.token !== rec?.token) return;
      // Keep the token while closed so other concurrent results remain valid.
      if (rec && rec.openUntil === undefined) rec.failures = 0;
      else breakers.delete(provider);
    },

    releaseProbe(provider, admission) {
      const rec = breakers.get(provider);
      if (admission && admission.token !== rec?.token) return;
      if (rec) {
        rec.probingSince = undefined;
        rec.token = ++nextToken;
      }
    },

    breakerOpenUntil(provider) {
      return breakers.get(provider)?.openUntil;
    },

    breakerSnapshot() {
      const now = clock.now();
      const out: Record<string, BreakerView> = {};
      for (const [name, rec] of breakers) {
        const state = stateOf(rec, now);
        if (state === "closed" && rec.failures === 0) continue;
        out[name] = {
          state,
          consecutiveFailures: rec.failures,
          trips: rec.trips,
          ...(rec.openUntil !== undefined ? { openUntil: rec.openUntil } : {}),
        };
      }
      return out;
    },

    deleteCooldown(provider) {
      entries.delete(provider);
      breakers.delete(provider);
    },

    clear() {
      entries.clear();
      breakers.clear();
    },
  };
}
