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
export declare const TAVILY_META: {
    readonly name: "tavily";
    readonly label: "Tavily";
    readonly description: "AI-optimized web search (chunks & depth)";
    readonly credSuffix: "TAVILY";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const TavilyProvider: ProviderAdapter;
