/**
 * dsh-web-tools — Firecrawl provider adapter.
 *
 * API reference: https://docs.firecrawl.dev
 * - Base URL: https://api.firecrawl.dev/v2
 * - Auth: `Authorization: Bearer fc-...`
 * - POST /search — discover pages by query
 * - POST /scrape — extract clean markdown from a single URL
 *
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { SearchHints } from "../search-hints.ts";
/**
 * Build the /v2/search request body for Firecrawl.
 * Maps:
 *  - topic=code → categories: ["developer"] (Firecrawl Developer Index for issues, PRs, docs, repos)
 *  - topic=research → categories: ["research"]
 *  - freshness preset → tbs (qdr:d for day, qdr:w for week, qdr:m for month, qdr:y for year)
 *  - hard domains → includeDomains / excludeDomains (mutually exclusive)
 *  - locale country → country
 */
export declare function buildFirecrawlSearchBody(query: string, limit: number, hints?: Readonly<SearchHints>): Record<string, unknown>;
export declare const FIRECRAWL_META: {
    readonly name: "firecrawl";
    readonly label: "Firecrawl";
    readonly description: "Search + clean scrape (markdown)";
    readonly credSuffix: "FIRECRAWL";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const FirecrawlProvider: ProviderAdapter;
