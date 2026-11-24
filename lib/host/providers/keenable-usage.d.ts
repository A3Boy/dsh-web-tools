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
/** UTC month key ("YYYY-MM") for a timestamp. */
export declare function monthKeyOf(at: number): string;
/**
 * Read the `usage` object of a /v1/search or /v1/fetch response.
 *
 * Keyless, x402 and ZeroClick calls report no usage, and an unparseable body
 * must never look like a free call: anything without a finite non-negative
 * `credits` is ignored.
 */
export declare function parseKeenableUsage(body: unknown): KeenableCallUsage | null;
/**
 * Add one call to the key's monthly ledger.
 * @returns the updated bucket, or undefined for an empty key.
 */
export declare function recordKeenableUsage(apiKey: string, usage: KeenableCallUsage, now?: number): KeenableUsageBucket | undefined;
/** Record a call straight from a parsed response body. */
export declare function recordKeenableUsageFromBody(apiKey: string, body: unknown, now?: number): KeenableUsageBucket | undefined;
/** The current month's bucket for a key, or undefined when it is stale/empty. */
export declare function keenableUsageOf(apiKey: string, now?: number): KeenableUsageBucket | undefined;
/**
 * Build a display-only quota snapshot from the local ledger.
 *
 * `unit: "credits"` with `used` but no `remaining`: the real balance is the
 * console's, and inventing a remaining/limit pair here would feed the router
 * (and the progress bar) a number it cannot justify.
 */
export declare function keenableLocalQuota(apiKey: string, now?: number): QuotaSnapshot | undefined;
/** Install the settings persistence hook (coalesced by the caller). */
export declare function setKeenableUsagePersist(hook: ((apiKey: string, bucket: KeenableUsageBucket) => void) | null): void;
/** Adopt the ledger loaded from settings at boot. */
export declare function seedKeenableUsageCache(cache: Record<string, KeenableUsageBucket> | undefined): void;
/** Test seam: drop the in-memory ledger. */
export declare function resetKeenableUsageCache(): void;
