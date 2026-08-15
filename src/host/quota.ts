/**
 * dsh-web-tools — unified quota snapshots across providers.
 *
 * Research findings (2026-08): different backends expose balance differently:
 *   - Tavily    : GET /usage (Bearer) → usage/limit per feature       [authoritative]
 *   - Firecrawl : GET /v2/team/credit-usage (Bearer) → remaining/plan  [authoritative]
 *   - You.com   : GET /v1/billing/account_balance (X-API-Key) → cents  [authoritative]
 *   - Brave     : X-RateLimit-* response headers → monthly requests     [authoritative]
 *   - Exa       : no public balance API → local estimate only          [non-authoritative]
 *   - Jina/Serper/Perplexity : dashboard only                          [non-authoritative]
 *   - SearXNG/Ollama : self-hosted, no platform credits
 *
 * The UI renders snapshots uniformly but NEVER converts different units into
 * a fake percentage. The router only uses `authoritative` snapshots to skip
 * exhausted providers; non-authoritative ones are ignored for quota logic.
 * @module
 */

/** Machine unit of one quota snapshot. */
export type QuotaUnit = "credits" | "requests" | "tokens" | "usd_cents" | "unknown";

/** Where the snapshot came from. */
export type QuotaSource =
  | "api"
  | "response_header"
  | "best_effort_api"
  | "local_estimate"
  | "dashboard"
  | "self_hosted";

export interface QuotaSnapshot {
  /** Whether this provider exposes any quota at all. */
  supported: boolean;
  /** True when the value comes from the backend itself (usable by the router). */
  authoritative: boolean;
  unit: QuotaUnit;
  /** Remaining amount (in `unit`). */
  remaining?: number;
  /** Limit in the same unit (may be undefined for usd balances). */
  limit?: number;
  /** ISO timestamp when the quota resets, when known. */
  resetAt?: string;
  /** Extra per-feature usage breakdown (Tavily) when available. */
  breakdown?: Record<string, number>;
  source: QuotaSource;
  /** Epoch ms when the snapshot was fetched. */
  fetchedAt: number;
  /** Free-text note for the UI (e.g. "dashboard only"). */
  note?: string;
}

/** A provider that can report quota. */
export interface QuotaProvider {
  /** Fetch the current quota snapshot. @throws classified errors. */
  quota(apiKey: string, baseUrl?: string, signal?: AbortSignal): Promise<QuotaSnapshot>;
}

/** A snapshot for providers with no quota concept (self-hosted / keyless). */
export function selfHostedQuota(note: string): QuotaSnapshot {
  return {
    supported: true,
    authoritative: true,
    unit: "unknown",
    source: "self_hosted",
    fetchedAt: Date.now(),
    note,
  };
}

/** A snapshot for providers whose balance is only in their dashboard. */
export function dashboardOnlyQuota(note: string): QuotaSnapshot {
  return {
    supported: false,
    authoritative: false,
    unit: "unknown",
    source: "dashboard",
    fetchedAt: Date.now(),
    note,
  };
}

/** A local-usage estimate (never authoritative, never used by the router). */
export function localEstimateQuota(estimatedUsdCents: number, note: string): QuotaSnapshot {
  return {
    supported: true,
    authoritative: false,
    unit: "usd_cents",
    remaining: estimatedUsdCents,
    source: "local_estimate",
    fetchedAt: Date.now(),
    note,
  };
}

/** True when a snapshot says the provider is effectively exhausted. */
export function isExhausted(snapshot: QuotaSnapshot | undefined): boolean {
  if (!snapshot?.authoritative) return false;
  if (snapshot.remaining === undefined) return false;
  // self-hosted "no quota" (unit unknown, no remaining) → never exhausted
  if (snapshot.unit === "unknown" && snapshot.remaining === undefined) return false;
  return snapshot.remaining <= 0;
}

/** True when a snapshot is below the given fraction of its limit (router hint). */
export function isLow(snapshot: QuotaSnapshot | undefined, fraction = 0.1): boolean {
  if (!snapshot?.authoritative || snapshot.remaining === undefined || snapshot.limit === undefined) return false;
  if (snapshot.limit <= 0) return false;
  return snapshot.remaining / snapshot.limit <= fraction;
}
