/**
 * dsh-web-tools — Brave Search provider adapter.
 *
 * API reference: https://api-dashboard.search.brave.com/documentation/services/llm-context
 * - LLM Context (preferred): POST https://api.search.brave.com/res/v1/llm/context
 *   Returns pre-extracted content optimized for AI agents / RAG.
 *   Response: { grounding: { generic: [{ url, title, snippets[] }] } }
 * - Classic Web Search (fallback): GET https://api.search.brave.com/res/v1/web/search
 *   Used when LLM Context is unavailable (e.g. plan doesn't support it → 403).
 * - Auth: X-Subscription-Token header.
 * - Quota: response headers carry the monthly request budget
 *   (X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset).
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";
import type { BraveProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";
/**
 * Map SearchHints freshness preset to Brave's freshness parameter:
 * pd = past 24 hours, pw = past 7 days, pm = past 31 days, py = past 365 days
 */
export declare function mapBraveFreshness(hints?: Readonly<SearchHints>): string | undefined;
/**
 * Build the LLM Context request body.
 */
export declare function buildBraveLlmContextBody(query: string, maxResults: number | undefined, options?: Readonly<BraveProviderOptions>, hints?: Readonly<SearchHints>): Record<string, unknown>;
export declare const BRAVE_META: {
    readonly name: "brave";
    readonly label: "Brave";
    readonly description: "Independent search index (LLM Context preferred)";
    readonly credSuffix: "BRAVE";
    readonly fetchCapable: false;
    readonly needsBaseUrl: false;
};
export declare const BraveProvider: ProviderAdapter;
/** Set the persistence callback (host wires this to its settings store). */
export declare function setBraveQuotaPersist(hook: (apiKey: string, snapshot: QuotaSnapshot) => void): void;
/** Seed the in-memory cache from persisted state (host calls on startup). */
export declare function seedBraveQuota(apiKey: string, snapshot: QuotaSnapshot): void;
/** Quota for the settings card: last-known snapshot for the given key. */
export declare function braveQuota(apiKey: string, _baseUrl?: string, _signal?: AbortSignal): Promise<QuotaSnapshot>;
/** Parse Brave quota from the search response headers (monthly window). */
export declare function braveQuotaFromHeaders(headers: Headers, fetchedAt?: number): QuotaSnapshot;
