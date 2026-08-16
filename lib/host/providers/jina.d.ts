/**
 * dsh-web-tools — Jina provider adapter.
 *
 * Search: POST https://s.jina.ai/ (Authorization: Bearer) — Jina's search
 *   endpoint returns text-ish results; parse URLs from the structured output.
 * Balance (best effort): GET https://r.jina.ai/ with the Bearer token returns
 *   a text page containing a "Balance left" line with the remaining tokens.
 *   This is a stable-but-unofficial contract — never authoritative, and a
 *   parse failure must degrade to "quota unavailable", never break search.
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";
export declare const JINA_META: {
    readonly name: "jina";
    readonly label: "Jina";
    readonly description: "Reader + search (token based)";
    readonly credSuffix: "JINA";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const JinaProvider: ProviderAdapter;
/**
 * Parse the "Balance left" line from Jina Reader output (best effort).
 * Defensive: any format change → undefined → quota shows unavailable.
 */
export declare function parseJinaBalance(text: string): number | undefined;
/** Best-effort Jina quota (never authoritative). */
export declare function jinaQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot>;
