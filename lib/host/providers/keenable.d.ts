/**
 * dsh-web-tools — Keenable provider adapter.
 *
 * Search: POST https://api.keenable.ai/v1/search (X-API-Key) with
 *   `{ query, max_results, site?, published_after?, published_before? }`;
 *   results live at `results[]` with
 *   `{ title, url, description, snippet, published_at }`. The snippet prefers
 *   `description`, falls back to `snippet`, and is capped either way.
 * API reference: https://docs.keenable.ai/api-reference/search
 * Search-only: web_fetch falls back to the built-in generic fetcher.
 * @module
 */
import { type ProviderAdapter, type Source } from "./types.ts";
import type { SearchHints } from "../search-hints.ts";
export declare const KEENABLE_META: {
    readonly name: "keenable";
    readonly label: "Keenable";
    readonly description: "Web search API (description-first snippets)";
    readonly credSuffix: "KEENABLE";
    readonly fetchCapable: false;
    readonly needsBaseUrl: false;
};
/** Normalize a Keenable `/v1/search` JSON body into sources. Pure, for tests. */
export declare function parseKeenableSearchJson(body: unknown, limit: number): Source[];
/** Build the `/v1/search` request body, forwarding site and date hints. Pure, for tests. */
export declare function buildKeenableSearchBody(query: string, limit: number, hints?: SearchHints): Record<string, unknown>;
export declare const KeenableProvider: ProviderAdapter;
