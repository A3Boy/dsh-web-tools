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
export declare function apply(ctx: WebToolsContext): void;
export { PROVIDER_ID };
