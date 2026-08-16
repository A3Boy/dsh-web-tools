/**
 * dsh-web-tools — You.com provider adapter.
 *
 * API: POST https://api.you.com/llm/search (X-API-Key header).
 * Balance: GET https://api.you.com/v1/billing/account_balance returns
 *   `data.attributes.balance` in USD cents — an official authoritative value.
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";
export declare const YOU_META: {
    readonly name: "you";
    readonly label: "You.com";
    readonly description: "AI search with USD credit balance";
    readonly credSuffix: "YOU";
    readonly fetchCapable: false;
    readonly needsBaseUrl: false;
};
export declare const YouProvider: ProviderAdapter;
/** You.com official account balance (USD cents). */
export declare function youQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot>;
