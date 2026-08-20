/**
 * dsh-web-tools — Exa provider adapter (neural/semantic search).
 *
 * Canonical reference: https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 * - POST https://api.exa.ai/search with `x-api-key` header (canonical raw REST)
 * - Content mode: `contents.highlights = { maxCharacters: 4000 }` (token-efficient,
 *   highly recommended for agent workflows) — falls back to `text` when highlights
 *   are absent
 * - `type: "auto"` for balanced neural / keyword retrieval
 * - /contents uses `urls` + `highlights` for fetch
 *
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
export declare const EXA_META: {
    readonly name: "exa";
    readonly label: "Exa";
    readonly description: "Semantic / neural web search (highlights & auto search)";
    readonly credSuffix: "EXA";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const ExaProvider: ProviderAdapter;
