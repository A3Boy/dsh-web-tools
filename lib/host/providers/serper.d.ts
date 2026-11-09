/**
 * dsh-web-tools — Serper (Google Search) provider adapter.
 *
 * Search: POST https://google.serper.dev/search (X-API-KEY) with
 *   `{ q, num, gl?, hl?, tbs? }`; results live at `organic[]` with
 *   `{ title, link, snippet, date }`, plus optional `answerBox` or `knowledgeGraph`.
 * API reference: https://serper.dev/playground
 * @module
 */
import { type ProviderAdapter, type Source } from "./types.ts";
import type { SearchHints } from "../search-hints.ts";
export declare const SERPER_META: {
    readonly name: "serper";
    readonly label: "Serper (Google)";
    readonly description: "Google search API with rich snippets and knowledge graph";
    readonly credSuffix: "SERPER";
    readonly fetchCapable: false;
    readonly needsBaseUrl: false;
};
/** Map SearchHints freshness to Google tbs parameter: qdr:d, qdr:w, qdr:m, qdr:y */
export declare function mapSerperFreshness(hints?: Readonly<SearchHints>): string | undefined;
/** Build the `/search` request body for Serper. Pure, for tests. */
export declare function buildSerperSearchBody(query: string, limit: number, hints?: SearchHints): Record<string, unknown>;
/** Parse Serper's organic results & answer box into normalized Sources. */
export declare function parseSerperSearchJson(body: unknown, limit: number): Source[];
export declare const SerperProvider: ProviderAdapter;
