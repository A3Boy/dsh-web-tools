/**
 * dsh-web-tools — Tavily provider adapter.
 *
 * API reference: https://docs.tavily.com/documentation/api-reference/endpoint/search
 * - Base URL: https://api.tavily.com
 * - Auth: `Authorization: Bearer tvly-...` (verified 2026-08-20)
 * - POST /search — search_depth basic/advanced/fast/ultra-fast, chunks_per_source
 * - POST /extract — URL extraction for web_fetch
 *
 * Error codes (verified):
 *   400 bad request, 401 auth, 429 rate-limit,
 *   432 plan limit exceeded, 433 paygo limit exceeded, 500 server
 *
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { TavilyProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";
/**
 * Build the POST request body for Tavily's /search endpoint.
 * Supports:
 *  - search_depth: "basic" | "advanced" | "fast" | "ultra-fast"
 *  - chunks_per_source: supported on basic, advanced, fast (not ultra-fast)
 *  - topic: "news" | "finance" from hints (code falls back to general)
 *  - time_range: "day" | "week" | "month" | "year"
 *  - start_date: RFC3339 / YYYY-MM-DD from hints
 *  - include_domains / exclude_domains
 */
export declare function buildTavilySearchBody(query: string, maxResults: number | undefined, options?: Readonly<TavilyProviderOptions>, hints?: Readonly<SearchHints>): Record<string, unknown>;
export declare const TAVILY_META: {
    readonly name: "tavily";
    readonly label: "Tavily";
    readonly description: "AI-optimized web search (chunks & depth)";
    readonly credSuffix: "TAVILY";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const TavilyProvider: ProviderAdapter;
