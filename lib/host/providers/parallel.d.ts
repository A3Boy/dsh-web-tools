/**
 * dsh-web-tools — Parallel provider adapter (8th adapter).
 *
 * Parallel is an agent-native web tools API: Search returns LLM-ranked
 * compressed excerpts, Extract returns page bodies as markdown.
 *
 * Search  : POST https://api.parallel.ai/v1/search
 *           x-api-key: <apiKey>, Content-Type: application/json
 *           body { objective, search_queries[], mode, advanced_settings }
 *           → results[] (url / title / publish_date / excerpts[])
 * Extract : POST https://api.parallel.ai/v1/extract
 *           body { urls[], advanced_settings: { full_content: true } }
 *           → results[] (url / title / excerpts[] / full_content)
 *
 * First-version scope (frozen):
 *   - REST only — the anonymous Search MCP endpoint is intentionally NOT
 *     wired into the provider (two auth semantics in one adapter would be
 *     confusing);
 *   - mode set to "advanced" (deep agent-optimized retrieval, official default);
 *   - no session_id (optional upstream; correlating search→extract runs
 *     would need per-run state this plugin deliberately avoids);
 *   - quota is dashboard-only — Parallel exposes usage/spend in its
 *     Platform dashboard, not through a balance endpoint an ordinary API
 *     key can call.
 * @module
 */
import { type ProviderAdapter, type Source } from "./types.ts";
export declare const PARALLEL_META: {
    readonly name: "parallel";
    readonly label: "Parallel";
    readonly description: "Agent-optimized search + extract (LLM-ranked excerpts)";
    readonly credSuffix: "PARALLEL";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const ParallelProvider: ProviderAdapter;
/** Clamp the requested result count into Parallel's accepted range (1..20). */
export declare function clampParallelCount(maxResults: number | undefined): number;
/**
 * Normalize one raw query into a Parallel search_queries entry: whitespace
 * collapsed, trimmed, and capped at 200 characters (the per-query API limit).
 */
export declare function normalizeParallelQuery(query: string): string;
/**
 * Build the /v1/search request body. `objective` carries the full natural
 * language goal; `search_queries` carries at least one derived query (the
 * docs recommend 2–3 but accept one). Mode is pinned to "basic" — see the
 * module doc. Count is the ALREADY clamped value.
 */
export declare function buildParallelSearchBody(query: string, count: number): Record<string, unknown>;
/**
 * Parse Parallel's search envelope ({ results: [...] }) into normalized
 * sources. `url` is required per item; `excerpts` (an array of LLM-ranked
 * compressed passages) are joined into the snippet and capped so a multi-
 * excerpt result cannot balloon the DSH search payload.
 */
export declare function parseParallelSearchResults(body: unknown, maxResults: number): Source[];
/**
 * Extract the page text from Parallel's extract envelope. Prefers
 * `full_content` (only present when requested); falls back to the joined
 * excerpts. Returns undefined when neither carries usable text — the caller
 * classifies that as a server failure.
 */
export declare function parseParallelExtractText(body: unknown): string | undefined;
