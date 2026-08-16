/**
 * dsh-web-tools — You.com provider adapter.
 *
 * API (2026-08, verified against the official You.com docs / SKILL):
 *   Search : POST https://api.you.com/v1/search
 *            X-API-Key: <apiKey>            (official header, see docs)
 *            body { query, num_web_results }
 *            → results.web[] (url/title/description/snippets/page_age)
 *   Balance: GET https://api.you.com/v1/billing/account_balance
 *            X-API-Key: <apiKey>
 *            → data.attributes.balance in USD cents (authoritative)
 *
 * The legacy POST /llm/search endpoint returns 404 — do not reintroduce it.
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
/** You.com official account balance (USD cents, Bearer auth). */
export declare function youQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot>;
