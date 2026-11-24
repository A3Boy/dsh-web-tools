/**
 * dsh-web-tools — Keenable usage accounting.
 *
 * Keenable bills every authenticated search/fetch in credits and reports the
 * charge in the response body itself:
 *
 *   "usage": { "sku": "search.pro", "amount": 1, "credits": 1, "paid": true }
 *
 * There is NO public balance endpoint: the OpenAPI document exposes only
 * /v1/search, /v1/fetch, /v1/auth/user and /v1/feedback, and /v1/auth/user
 * carries no credit information. The console instead reads an authoritative
 * balance from a session-only BFF route (see `keenable-bff.ts`).
 *
 * This module keeps the per-key, per-month ledger for THIS install. It is
 * display-only and never authoritative for routing: it only sees the calls
 * that actually went through this plugin, not the organization's total.
 * @module
 */
import type { QuotaSnapshot } from "../quota.ts";

/** One call's reported charge. */
export interface KeenableCallUsage {
  /** Credits this call cost. */
  credits: number;
  /** Billing SKU, e.g. "search.pro" / "fetch.live". */
  sku?: string;
  /** Raw `amount` from the response, when present. */
  amount?: number;
  /** True when the call drew on purchased credits instead of the free allowance. */
  paid: boolean;
}

/** Per-key accumulator for the current UTC month. */
export interface KeenableUsageBucket {
  /** UTC month key, "YYYY-MM". */
  month: string;
  /** Credits charged this month. */
  credits: number;
  /** Subset of `credits` charged to purchased (not free) credits. */
  paidCredits: number;
  /** Number of billed calls observed. */
  calls: number;
  /** SKU of the most recent billed call. */
  lastSku?: string;
  /** Epoch ms of the most recent billed call. */
  lastAt?: number;
}

const usageCache = new Map<string, KeenableUsageBucket>();
let persistHook: ((apiKey: string, bucket: KeenableUsageBucket) => void) | null = null;

/** UTC month key ("YYYY-MM") for a timestamp. */
export function monthKeyOf(at: number): string {
  return new Date(at).toISOString().slice(0, 7);
}

function nonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Round away binary-float noise without changing the real value. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Read the `usage` object of a /v1/search or /v1/fetch response.
 *
 * Keyless, x402 and ZeroClick calls report no usage, and an unparseable body
 * must never look like a free call: anything without a finite non-negative
 * `credits` is ignored.
 */
export function parseKeenableUsage(body: unknown): KeenableCallUsage | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as Record<string, unknown>).usage;
  if (!raw || typeof raw !== "object") return null;
  const usage = raw as Record<string, unknown>;
  const credits = nonNegative(usage.credits);
  if (credits === undefined) return null;
  const amount = nonNegative(usage.amount);
  const sku = typeof usage.sku === "string" && usage.sku ? usage.sku : undefined;
  return {
    credits,
    paid: usage.paid === true,
    ...(sku ? { sku } : {}),
    ...(amount !== undefined ? { amount } : {}),
  };
}

/**
 * Add one call to the key's monthly ledger.
 * @returns the updated bucket, or undefined for an empty key.
 */
export function recordKeenableUsage(
  apiKey: string,
  usage: KeenableCallUsage,
  now = Date.now(),
): KeenableUsageBucket | undefined {
  const key = apiKey.trim();
  if (!key) return undefined;
  const month = monthKeyOf(now);
  const previous = usageCache.get(key);
  const bucket: KeenableUsageBucket = previous && previous.month === month
    ? previous
    : { month, credits: 0, paidCredits: 0, calls: 0 };
  bucket.credits = round6(bucket.credits + usage.credits);
  if (usage.paid) bucket.paidCredits = round6(bucket.paidCredits + usage.credits);
  bucket.calls += 1;
  if (usage.sku) bucket.lastSku = usage.sku;
  bucket.lastAt = now;
  usageCache.set(key, bucket);
  persistHook?.(key, { ...bucket });
  return { ...bucket };
}

/** Record a call straight from a parsed response body. */
export function recordKeenableUsageFromBody(
  apiKey: string,
  body: unknown,
  now = Date.now(),
): KeenableUsageBucket | undefined {
  const usage = parseKeenableUsage(body);
  return usage ? recordKeenableUsage(apiKey, usage, now) : undefined;
}

/** The current month's bucket for a key, or undefined when it is stale/empty. */
export function keenableUsageOf(apiKey: string, now = Date.now()): KeenableUsageBucket | undefined {
  const bucket = usageCache.get(apiKey.trim());
  if (!bucket || bucket.month !== monthKeyOf(now)) return undefined;
  return bucket;
}

/**
 * Build a display-only quota snapshot from the local ledger.
 *
 * `unit: "credits"` with `used` but no `remaining`: the real balance is the
 * console's, and inventing a remaining/limit pair here would feed the router
 * (and the progress bar) a number it cannot justify.
 */
export function keenableLocalQuota(apiKey: string, now = Date.now()): QuotaSnapshot | undefined {
  const bucket = keenableUsageOf(apiKey, now);
  if (!bucket || bucket.calls === 0) return undefined;
  const breakdown: Record<string, number> = { calls: bucket.calls };
  if (bucket.paidCredits > 0) breakdown.paid_credits = bucket.paidCredits;
  return {
    supported: true,
    authoritative: false,
    unit: "credits",
    used: bucket.credits,
    breakdown,
    source: "local_estimate",
    fetchedAt: now,
    note: `Local ledger: ${bucket.calls} billed call(s) this month${bucket.lastSku ? `, last SKU ${bucket.lastSku}` : ""} — the console holds the real balance`,
  };
}

/** Install the settings persistence hook (coalesced by the caller). */
export function setKeenableUsagePersist(
  hook: ((apiKey: string, bucket: KeenableUsageBucket) => void) | null,
): void {
  persistHook = hook;
}

/** Adopt the ledger loaded from settings at boot. */
export function seedKeenableUsageCache(cache: Record<string, KeenableUsageBucket> | undefined): void {
  usageCache.clear();
  for (const [key, bucket] of Object.entries(cache ?? {})) {
    if (!key || !bucket || typeof bucket !== "object") continue;
    if (typeof bucket.month !== "string" || !/^\d{4}-\d{2}$/.test(bucket.month)) continue;
    usageCache.set(key, {
      month: bucket.month,
      credits: nonNegative(bucket.credits) ?? 0,
      paidCredits: nonNegative(bucket.paidCredits) ?? 0,
      calls: nonNegative(bucket.calls) ?? 0,
      ...(typeof bucket.lastSku === "string" ? { lastSku: bucket.lastSku } : {}),
      ...(typeof bucket.lastAt === "number" && Number.isFinite(bucket.lastAt) ? { lastAt: bucket.lastAt } : {}),
    });
  }
}

/** Test seam: drop the in-memory ledger. */
export function resetKeenableUsageCache(): void {
  usageCache.clear();
  persistHook = null;
}
