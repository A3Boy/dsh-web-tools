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
export declare const FIRECRAWL_META: {
    readonly name: "firecrawl";
    readonly label: "Firecrawl";
    readonly description: "Search + clean scrape (markdown)";
    readonly credSuffix: "FIRECRAWL";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const FirecrawlProvider: ProviderAdapter;
