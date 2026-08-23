/**
 * dsh-web-tools — SearXNG provider adapter (self-hosted, keyless option).
 * Queries the local instance's JSON output (GET {baseUrl}/search?format=json).
 * SSRF guard: refuses private/loopback targets unless the operator explicitly
 * opts in (self-hosted SearXNG on localhost is the normal case, so the guard
 * applies to the search TARGET, not the instance URL — the instance URL is
 * operator-configured and trusted by definition).
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { SearchHints } from "../search-hints.ts";
export declare const SEARXNG_META: {
    readonly name: "searxng";
    readonly label: "SearXNG";
    readonly description: "Self-hosted metasearch (JSON output)";
    readonly credSuffix: "SEARXNG";
    readonly fetchCapable: false;
    readonly needsBaseUrl: true;
    readonly defaultBaseUrl: "http://127.0.0.1:8080";
};
/**
 * Build SearXNG URL parameters based on query, options, and SearchHints.
 * Maps:
 *  - topic=code → categories=it
 *  - topic=research → categories=science
 *  - topic=news → categories=news
 *  - freshness preset → time_range: "day" | "week" | "month" | "year"
 *  - language → language (e.g. "zh-CN", "en")
 */
export declare function buildSearxngUrl(instanceUrl: string, query: string, apiKey?: string, hints?: Readonly<SearchHints>): URL;
export declare const SearxngProvider: ProviderAdapter;
