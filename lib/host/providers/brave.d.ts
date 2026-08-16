/**
 * dsh-web-tools — Brave Search provider adapter.
 *
 * API: POST https://api.search.brave.com/res/v1/web/search
 * Auth: X-Subscription-Token header.
 * Quota: the response headers carry the monthly request budget
 *   (X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset) — there is
 *   no separate balance endpoint, so quota is captured per search response.
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";
export declare const BRAVE_META: {
    readonly name: "brave";
    readonly label: "Brave";
    readonly description: "Independent search index";
    readonly credSuffix: "BRAVE";
    readonly fetchCapable: false;
    readonly needsBaseUrl: false;
};
export declare const BraveProvider: ProviderAdapter;
/** Quota for the settings card: last-known snapshot for the given key. */
export declare function braveQuota(apiKey: string, _baseUrl?: string, _signal?: AbortSignal): Promise<QuotaSnapshot>;
/** Parse Brave quota from the search response headers (monthly window). */
export declare function braveQuotaFromHeaders(headers: Headers, fetchedAt?: number): QuotaSnapshot;
