/**
 * dsh-web-tools — Jina provider adapter.
 *
 * Search: GET https://s.jina.ai/{query}?count=N (Authorization: Bearer,
 *   Accept: application/json) — Jina's official search endpoint returns a
 *   JSON envelope `{ code, status, data: [{ title, url, description,
 *   publishedTime, ... }] }`; we normalize `data[]` into sources and never
 *   hand-parse text.
 * Balance (best effort): GET https://r.jina.ai/ with the Bearer token returns
 *   a text page containing a "Balance left" line with the remaining tokens.
 *   This is a stable-but-unofficial contract — never authoritative, and a
 *   parse failure must degrade to "quota unavailable", never break search.
 * @module
 */
import { type ProviderAdapter, type Source } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";
import type { JinaProviderOptions } from "../../shared/provider-options.ts";
export declare const JINA_META: {
    readonly name: "jina";
    readonly label: "Jina";
    readonly description: "Reader + search (token based)";
    readonly credSuffix: "JINA";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
/**
 * Build Reader request headers from user-configured options.
 * Pure function (no side effects) for testability.
 * - X-Engine: auto | curl | browser (NOT direct — deprecated upstream).
 * - X-Cache-Tolerance: seconds; 0 = force fresh.
 * - X-Max-Tokens: trim output guard.
 * - X-Token-Budget: hard budget guard (rejects on overage).
 * - X-Respond-With: readerlm-v2 for higher-quality HTML→Markdown conversion.
 */
export declare function buildJinaReaderHeaders(token: string, options?: Readonly<JinaProviderOptions>): Record<string, string>;
export declare const JinaProvider: ProviderAdapter;
/**
 * Parse Jina's official JSON search envelope into normalized sources.
 * The envelope is `{ code, status, data: [...] }`; each data item carries at
 * least `url` (required), plus optional `title` / `description` /
 * `publishedTime`. Items without a usable `url` are skipped; the result is
 * capped at `maxResults`.
 */
export declare function parseJinaSearchJson(body: unknown, maxResults: number): Source[];
/**
 * Parse the "Balance left" line from Jina Reader output (best effort).
 * Defensive: any format change → undefined → quota shows unavailable.
 */
export declare function parseJinaBalance(text: string): number | undefined;
/** Best-effort Jina quota (never authoritative). */
export declare function jinaQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot>;
