/**
 * dsh-web-tools — Exa provider adapter (neural/semantic search).
 *
 * Canonical reference: https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 * - POST https://api.exa.ai/search with `x-api-key` header (canonical raw REST)
 * - Content mode: `contents.highlights = true` (token-efficient extractive highlights)
 * - `type: "auto"` for balanced neural / keyword retrieval
 * - /contents uses `urls` + `text: true` for full-page markdown fetch
 *
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { ExaProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";
/**
 * Build the POST request body for Exa /search.
 * Supports:
 *  - query (cleanQuery)
 *  - type: auto / fast / deep etc.
 *  - category: "publication" (research), "news" (news), "financial report" (finance), "company", "people"
 *  - includeDomains / excludeDomains
 *  - startPublishedDate / endPublishedDate (ISO 8601)
 *  - userLocation (country code)
 */
export declare function buildExaSearchBody(query: string, numResults: number, options?: Readonly<ExaProviderOptions>, hints?: Readonly<SearchHints>): Record<string, unknown>;
export declare const EXA_META: {
    readonly name: "exa";
    readonly label: "Exa";
    readonly description: "Semantic / neural web search (highlights & auto search)";
    readonly credSuffix: "EXA";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const ExaProvider: ProviderAdapter;
