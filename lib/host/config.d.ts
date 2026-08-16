/**
 * dsh-web-tools — Host configuration: settings namespace + schema.
 *
 * The config (non-secret knobs) lives in a `dsh-web-tools` settings namespace
 * registered through the settings service, so it persists with the deployment's
 * settings document. API keys are NOT here — they live in the credentials
 * domain (`WEB_TOOLS_*` refs).
 * @module
 */
import z from "@deepseek-ai/schemastery";
import type { WebToolsContext } from "./context-types.ts";
import type { QuotaSnapshot } from "./quota.ts";
/** Settings namespace for this plugin. */
export declare const SETTINGS_NS = "dsh-web-tools";
/** Default provider when nothing is configured. */
export declare const DEFAULT_PROVIDER = "tavily";
/**
 * Explicit defaults. The resolved settings type is `WebToolsSettings` (below);
 * `Config` is the schemastery schema annotated the official way
 * (`z<WebToolsSettings>`) so the emitted d.ts references only `schemastery`,
 * never the dsh-private cosmokit copy.
 */
export declare const DEFAULT_SETTINGS: {
    enabled: boolean;
    defaultProvider: string;
    providerAttemptTimeoutMs: number;
    fallbackOrder: string[];
    providerBaseUrls: Record<string, string>;
    providerEnabled: Record<string, boolean>;
    braveQuotaCache: Record<string, QuotaSnapshot>;
    uiLanguage: "auto" | "zh" | "en";
};
/** Resolved settings shape (explicit interface — portable in emitted d.ts). */
export interface WebToolsSettings {
    enabled: boolean;
    defaultProvider: string;
    providerAttemptTimeoutMs: number;
    fallbackOrder: string[];
    providerBaseUrls: Record<string, string>;
    providerEnabled: Record<string, boolean>;
    /** Brave per-key quota snapshots captured from search response headers. */
    braveQuotaCache: Record<string, QuotaSnapshot>;
    /** Page UI language: "auto" follows the DSH UI language, "zh"/"en" force it. */
    uiLanguage: "auto" | "zh" | "en";
}
/** The schema object for settings registration (official z<T> annotation). */
export declare const Config: z<WebToolsSettings>;
/** A settings-scope handle: current value + write path. */
export interface ConfigHandle {
    /** Resolve the current effective section (re-read each call → live edits apply). */
    read: () => WebToolsSettings;
    /** Write a partial patch into the namespace; resolves when persisted. */
    write: (patch: Partial<WebToolsSettings>) => Promise<void>;
    /**
     * Called once the settings namespace is registered (ctx.inject callback).
     * Use it for anything that must read persisted settings at boot — the
     * synchronous apply() body runs BEFORE the inject callback, so reading
     * config there would only see the defaults.
     */
    onMounted: (cb: () => void) => void;
}
/**
 * Register the settings namespace; returns a handle for reads (live) and
 * Host-side writes. The browser card writes through the fenced routes, never
 * through settings/mutate (that proxy's whitelist excludes third-party
 * namespaces).
 */
export declare function installConfig(ctx: WebToolsContext): ConfigHandle;
