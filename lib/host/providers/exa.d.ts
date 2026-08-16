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
export declare const EXA_META: {
    readonly name: "exa";
    readonly label: "Exa";
    readonly description: "Semantic / neural web search";
    readonly credSuffix: "EXA";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const ExaProvider: ProviderAdapter;
