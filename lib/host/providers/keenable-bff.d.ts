/**
 * dsh-web-tools — Keenable console balance (undocumented BFF route).
 *
 * Keenable has no public usage/balance endpoint: the OpenAPI document exposes
 * only /v1/search, /v1/fetch, /v1/auth/user and /v1/feedback. The web console
 * reads an organization balance from
 *
 *   GET https://api.keenable.ai/bff/organization/balance
 *
 * authenticated with a Supabase session bearer token — an API key is rejected
 * ("Missing bearer token" / "Invalid or expired token"). That route is not
 * documented, not versioned, and may change without notice, so this module is
 * strictly best-effort: every failure returns null and the caller falls back
 * to the local ledger in `keenable-usage.ts`.
 *
 * Credentials come from the environment, never from the provider API key:
 *   KEENABLE_REFRESH_TOKEN  Supabase refresh token (long lived) — refreshed here
 *   KEENABLE_SESSION_TOKEN  Supabase access token (short lived, ~1h) — used as-is
 *
 * @module
 */
import type { QuotaSnapshot } from "../quota.ts";
/** Root of the console's backend-for-frontend. */
export declare const KEENABLE_BFF_BASE = "https://api.keenable.ai/bff";
/** Supabase project behind the Keenable console. */
export declare const KEENABLE_SUPABASE_URL = "https://caqmfcgrdovyjdhfnwzw.supabase.co";
/** Normalized view of the BFF balance document. */
export interface KeenableBalanceView {
    /** Free monthly allowance, in credits. */
    totalCredits: number;
    /** Credits spent from the allowance this period. */
    spentCredits: number;
    /** Credits left on the free allowance (never below zero). */
    remainingCredits: number;
    /** Purchased credits remaining, when reported. */
    paidCredits: number;
    /** Next monthly reset (ISO), derived from the activation date. */
    resetAt?: string;
    /** Per-SKU spendings plus paid_credits, when reported. */
    breakdown: Record<string, number>;
}
/** True when either console session variable is set. */
export declare function keenableSessionConfigured(): boolean;
/**
 * Next monthly reset, mirroring the console: the allowance renews on the
 * activation day-of-month (clamped to the month's last day) at the same UTC
 * time of day.
 */
export declare function nextMonthlyReset(activationIso: string, now?: number): string | undefined;
/**
 * Normalize the BFF balance document.
 *
 * Field names follow the console bundle (`free_credits`, `charged_spendings`
 * or the per-SKU `search_spendings`/`fetch_spendings`/`workflow_spendings`,
 * `paid_credits`, `activation_date`); camelCase spellings are accepted too so
 * a casing change does not silently disable the feature. A document without a
 * recognizable allowance returns null rather than a fake balance.
 */
export declare function mapKeenableBalance(body: unknown): KeenableBalanceView | null;
/** Turn a normalized balance into the shared quota snapshot shape. */
export declare function balanceSnapshot(view: KeenableBalanceView, group?: string): QuotaSnapshot;
/**
 * Fetch the console balance.
 *
 * Returns null whenever the answer is unavailable — no session configured, an
 * expired/revoked token, a network failure, or an unrecognized document — so
 * the caller can fall back without special-casing errors.
 */
export declare function fetchKeenableBalance(signal?: AbortSignal): Promise<QuotaSnapshot | null>;
/** Test seam: drop the cached access token and the balance memo. */
export declare function resetKeenableBffSession(): void;
