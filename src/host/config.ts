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
  maxResults: 5,
  searchTimeoutMs: 10000,
  fallbackOrder: [] as string[],
  maxFallbackProviders: 2,
  providerBaseUrls: {} as Record<string, string>,
  providerEnabled: {} as Record<string, boolean>,
};

/** Resolved settings shape (explicit interface — portable in emitted d.ts). */
export interface WebToolsSettings {
  enabled: boolean;
  defaultProvider: string;
  maxResults: number;
  searchTimeoutMs: number;
  fallbackOrder: string[];
  maxFallbackProviders: number;
  providerBaseUrls: Record<string, string>;
  providerEnabled: Record<string, boolean>;
}

/** The schema object for settings registration (official z<T> annotation). */
export const Config: z<WebToolsSettings> = z.object({
  enabled: z.boolean(),
  defaultProvider: z.string(),
  maxResults: z.number().step(1).min(1).max(10),
  searchTimeoutMs: z.number().step(1).min(1000).max(60000),
  fallbackOrder: z.array(z.string()),
  maxFallbackProviders: z.number().step(1).min(0).max(5),
  providerBaseUrls: z.dict(z.string()),
  providerEnabled: z.dict(z.boolean()),
});

/** A settings-scope handle: current value + write path. */
export interface ConfigHandle {
  /** Resolve the current effective section (re-read each call → live edits apply). */
  read: () => WebToolsSettings;
  /** Write a partial patch into the namespace (Host-side authority). */
  write: (patch: Partial<WebToolsSettings>) => void;
}

/**
 * Register the settings namespace; returns a handle for reads (live) and
 * Host-side writes. The browser card writes through the fenced routes, never
 * through settings/mutate (that proxy's whitelist excludes third-party
 * namespaces).
 */
export function installConfig(ctx: WebToolsContext): ConfigHandle {
  let current = () => DEFAULT_SETTINGS;
  let scope: { update: (patch: object) => Promise<void> } | undefined;

  ctx.inject(["settings"], (sctx) => {
    const registered = sctx.settings.register(SETTINGS_NS, Config, {
      base: DEFAULT_SETTINGS,
    });
    scope = registered;
    current = () => registered.get() as WebToolsSettings;
  });

  return {
    read: () => current(),
    write: (patch) => {
      if (!scope) throw new Error("dsh-web-tools settings namespace is not mounted");
      void scope.update(patch);
    },
  };
}
