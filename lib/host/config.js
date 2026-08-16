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
/** Settings namespace for this plugin. */
export const SETTINGS_NS = "dsh-web-tools";
/** Default provider when nothing is configured. */
export const DEFAULT_PROVIDER = "tavily";
/**
 * Explicit defaults. The resolved settings type is `WebToolsSettings` (below);
 * `Config` is the schemastery schema annotated the official way
 * (`z<WebToolsSettings>`) so the emitted d.ts references only `schemastery`,
 * never the dsh-private cosmokit copy.
 */
export const DEFAULT_SETTINGS = {
    enabled: true,
    defaultProvider: DEFAULT_PROVIDER,
    // Per-attempt budget for ONE provider call (the DSH tool owns the overall
    // web_search timeout). Distinct from tool-level timeout: this is how long a
    // single provider may run before we abort it and try the next one.
    providerAttemptTimeoutMs: 10000,
    fallbackOrder: [],
    providerBaseUrls: {},
    providerEnabled: {},
    // Brave has NO quota endpoint — its only quota signal is the X-RateLimit-*
    // response header captured during a real search. Persisted here so a
    // restart does not forget the last known balance (keyed by API key).
    braveQuotaCache: {},
    // Page UI language: "auto" follows the DSH UI language; "zh"/"en" force the
    // page to that language regardless of the DSH-wide preference.
    uiLanguage: "auto",
};
/** The schema object for settings registration (official z<T> annotation). */
export const Config = z.object({
    enabled: z.boolean(),
    defaultProvider: z.string(),
    providerAttemptTimeoutMs: z.number().step(1).min(1000).max(60000),
    fallbackOrder: z.array(z.string()),
    providerBaseUrls: z.dict(z.string()),
    providerEnabled: z.dict(z.boolean()),
    braveQuotaCache: z.dict(z.any()),
    uiLanguage: z.union([z.const("auto"), z.const("zh"), z.const("en")]),
});
/**
 * Register the settings namespace; returns a handle for reads (live) and
 * Host-side writes. The browser card writes through the fenced routes, never
 * through settings/mutate (that proxy's whitelist excludes third-party
 * namespaces).
 */
export function installConfig(ctx) {
    let current = () => DEFAULT_SETTINGS;
    let scope;
    const mountedCbs = [];
    ctx.inject(["settings"], (sctx) => {
        const registered = sctx.settings.register(SETTINGS_NS, Config, {
            base: DEFAULT_SETTINGS,
        });
        scope = registered;
        current = () => registered.get();
        // Settings are readable only from here on; run deferred boot work now.
        for (const cb of mountedCbs.splice(0))
            cb();
    });
    return {
        read: () => current(),
        write: async (patch) => {
            if (!scope)
                throw new Error("dsh-web-tools settings namespace is not mounted");
            await scope.update(patch);
        },
        onMounted: (cb) => mountedCbs.push(cb),
    };
}
