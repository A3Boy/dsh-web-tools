/**
 * dsh-web-tools — Host plugin entry.
 *
 * Registers:
 *  - the `dsh-web-tools` settings namespace (non-secret config)
 *  - a `ctx.web` search/fetch provider (multi-provider pools + fallback) so the
 *    model-facing `web_search`/`web_fetch` tools execute through it
 *  - a fenced `/web-tools/api` route prefix serving the browser settings card
 *    (config authority + credentials state + quota snapshots + test search)
 *
 * @module
 */
import type { WebToolsContext } from "./context-types.ts";
import { type WebToolsSettings } from "./config.ts";
import { PROVIDER_ID } from "./registry.ts";
import type { SourceDegradation, SourceFetchOutcome } from "./sources/types.ts";
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "dsh-web-tools";
/** Services required by this plugin. */
export declare const inject: string[];
/**
 * Plugin-level config: the same schemastery schema as the settings namespace.
 * Cordis requires `Config` to be a schema instance (it calls `.validate` when
 * resolving plugin config); an empty object would crash at load.
 */
export declare const Config: import("@deepseek-ai/schemastery").default<WebToolsSettings>;
export declare function toRoutedFetchResponse(url: string, outcome: SourceFetchOutcome): {
    url: string;
    statusCode: number;
    body: {
        kind: "text";
        content: string;
    };
    truncated: boolean;
};
/**
 * One-line, model-facing explanation of a degraded platform search.
 *
 * The web_search tool renders `content` above the source list, so this is the
 * only place where an agent (and the operator reading the transcript) can learn
 * that these are site:-filtered web results rather than in-app posts.
 */
export declare function describeDegradation(d: SourceDegradation): string;
export declare function apply(ctx: WebToolsContext, config?: unknown): void;
export { PROVIDER_ID };
