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
export type QuotaSource = "api" | "response_header" | "best_effort_api" | "local_estimate" | "dashboard" | "self_hosted";
export interface QuotaSnapshot {
    /** Whether this provider exposes any quota at all. */
    supported: boolean;
    /** True when the value comes from the backend itself (usable by the router). */
    authoritative: boolean;
    unit: QuotaUnit;
    /** Remaining amount (in `unit`). */
    remaining?: number;
    /** Used amount (in `unit`) — for usage/cost endpoints that report usage. */
    used?: number;
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
export declare function selfHostedQuota(note: string): QuotaSnapshot;
/** A snapshot for providers whose balance is only in their dashboard. */
export declare function dashboardOnlyQuota(note: string): QuotaSnapshot;
/** A local-usage estimate (never authoritative, never used by the router).
 *  The value is a locally-observed SPEND estimate (usage), not a remaining
 *  balance — it must ride `used`, never `remaining`, so the UI renders
 *  "已用 / used" and never fabricates a fake "剩余 / remaining" balance. */
export declare function localEstimateQuota(estimatedUsdCents: number, note: string): QuotaSnapshot;
/** True when a snapshot says the provider is effectively exhausted. */
export declare function isExhausted(snapshot: QuotaSnapshot | undefined): boolean;
/** True when a snapshot is below the given fraction of its limit (router hint). */
export declare function isLow(snapshot: QuotaSnapshot | undefined, fraction?: number): boolean;
/**
 * Merge per-key quota snapshots of one provider pool into a single
 * "total pool" snapshot: remaining/used/limit are summed across keys, the
 * unit and reset window come from the first authoritative snapshot, and the
 * note records the multi-key aggregation.
 * @param snapshots - one snapshot per key (never empty).
 * @returns the combined snapshot (same shape as a single-key one).
 */
export declare function mergePoolQuota(snapshots: QuotaSnapshot[]): QuotaSnapshot;
