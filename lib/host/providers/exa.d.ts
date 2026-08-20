/**
 * dsh-web-tools — Exa provider adapter (neural/semantic search).
 *
 * Canonical reference: https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 * - POST https://api.exa.ai/search with `x-api-key` header
 * - Content mode: `contents.highlights: true` (token-efficient, recommended
 *   for agent workflows) — NOT `text: true` which can blow up context
 * - `type: "auto"` for balanced relevance/speed
 * - /contents uses `urls` + `highlights` for fetch
 *
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { ProviderAdvancedContract } from "../advanced-search-types.ts";
export declare const EXA_META: {
    readonly name: "exa";
    readonly label: "Exa";
    readonly description: "Semantic / neural web search";
    readonly credSuffix: "EXA";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const ExaProvider: ProviderAdapter;
/** Exa search types (official enum, latency ranges from ~250ms to ~40s). */
declare const EXA_TYPES: readonly ["auto", "instant", "fast", "deep-lite", "deep", "deep-reasoning"];
type ExaType = typeof EXA_TYPES[number];
/** Official category enum (verified against https://exa.ai/docs/reference/search). */
declare const EXA_CATEGORIES: readonly ["company", "people", "research paper", "news", "personal site", "financial report"];
type ExaCategory = typeof EXA_CATEGORIES[number];
/**
 * Provider-native Exa advanced request. Agent-facing tool schema fields use
 * snake_case; `toWire` translates to camelCase for the REST API.
 */
export interface ExaAdvancedRequest {
    readonly query: string;
    readonly type?: ExaType;
    readonly num_results?: number;
    readonly category?: ExaCategory;
    readonly include_domains?: readonly string[];
    readonly exclude_domains?: readonly string[];
    readonly start_published_date?: string;
    readonly end_published_date?: string;
    readonly additional_queries?: readonly string[];
    readonly highlights?: boolean;
    readonly max_age_hours?: number;
}
/** The Exa provider-native advanced search contract. */
export declare const EXA_ADVANCED: ProviderAdvancedContract<ExaAdvancedRequest>;
export {};
