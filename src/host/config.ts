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
import type { StoredProviderOptions } from "../shared/provider-options.ts";
import type { SearchRoutingPolicy } from "../shared/api-types.ts";

/** Persistent search routing policy id (shared with the client card). */
export type ToolSearchRoutingPolicy = SearchRoutingPolicy;

/** Settings namespace for this plugin. */
export const SETTINGS_NS = "dsh-web-tools";

/** Default provider when nothing is configured. Changed from tavily to exa
 *  based on P5 evaluation: Exa achieves 72.2% Top-1, 97.2% Top-3 evidence,
 *  75% official source hit, 0% generic, 0% error across 36 tasks.
 *  This only affects new installs — existing users keep their saved provider. */
export const DEFAULT_PROVIDER = "exa";

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
  fallbackOrder: [] as string[],
  providerBaseUrls: {} as Record<string, string>,
  providerEnabled: {} as Record<string, boolean>,
  platformEnabled: { xiaohongshu: true, x: true } as Record<string, boolean>,
  providerOptions: {} as StoredProviderOptions,
  // Brave has NO quota endpoint — its only quota signal is the X-RateLimit-*
  // response header captured during a real search. Persisted here so a
  // restart does not forget the last known balance (keyed by API key).
  braveQuotaCache: {} as Record<string, QuotaSnapshot>,
  // Search routing policy: how the runtime picks the starting provider per
  // search query. "ordered" = always from the first available; "round-robin"
  // and "random" rotate the start offset (see routing-policy.ts).
  searchRoutingPolicy: "ordered" as ToolSearchRoutingPolicy,
};

/** Resolved settings shape (explicit interface — portable in emitted d.ts). */
export interface WebToolsSettings {
  enabled: boolean;
  defaultProvider: string;
  providerAttemptTimeoutMs: number;
  fallbackOrder: string[];
  providerBaseUrls: Record<string, string>;
  providerEnabled: Record<string, boolean>;
  platformEnabled: Record<string, boolean>;
  providerOptions: StoredProviderOptions;
  /** Brave per-key quota snapshots captured from search response headers. */
  braveQuotaCache: Record<string, QuotaSnapshot>;
  /** Search routing policy (see shared api-types). */
  searchRoutingPolicy: ToolSearchRoutingPolicy;
}

/** The schema object for settings registration (official z<T> annotation). */
export const Config: z<WebToolsSettings> = z.object({
  enabled: z.boolean(),
  defaultProvider: z.string(),
  providerAttemptTimeoutMs: z.number().step(1).min(1000).max(60000),
  fallbackOrder: z.array(z.string()),
  providerBaseUrls: z.dict(z.string()),
  providerEnabled: z.dict(z.boolean()),
  platformEnabled: z.dict(z.boolean()),
  providerOptions: z.dict(z.any()),
  braveQuotaCache: z.dict(z.any()),
  searchRoutingPolicy: z.union([z.const("ordered"), z.const("round-robin"), z.const("random")]),
});
// Mark volatile for DSH 0.1.7+ SettingsForms and config editor
(Config as any).meta = { ...(Config as any).meta, volatile: true };

function unwrapConfig(val: unknown): unknown {
  if (val && typeof (val as any).get === "function") {
    return unwrapConfig((val as any).get());
  }
  if (Array.isArray(val)) {
    return val.map(unwrapConfig);
  }
  if (val !== null && typeof val === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = unwrapConfig(v);
    }
    return res;
  }
  return val;
}

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
export function installConfig(ctx: WebToolsContext, initialConfig?: unknown): ConfigHandle {
  const unwrapped = (unwrapConfig(initialConfig) as Partial<WebToolsSettings>) ?? {};
  const configured: WebToolsSettings = {
    ...DEFAULT_SETTINGS,
    ...unwrapped,
  };

  let current = () => configured;
  let scope: { update: (patch: object) => Promise<void>; get?: () => unknown } | undefined;
  let service: any;
  let mounted = false;
  const mountedCbs: Array<() => void> = [];

  ctx.inject(["settings"], (sctx: any) => {
    service = sctx.settings;
    if (typeof service?.register === "function") {
      // DSH pre-0.1.7: Settings service had register()
      const registered = service.register(SETTINGS_NS, Config, {
        base: configured,
      });
      scope = registered;
      current = () => registered.get() as WebToolsSettings;
    } else {
      // DSH 0.1.7+: SettingsForms has no register(); initial config came from loader.
      // Register presentation policy to prevent an empty generic page from auto-generating.
      if (typeof service?.configure === "function") {
        try {
          ctx.effect?.(() => service.configure({ auto: false }, (ctx as any).fiber));
        } catch {}
      }
    }
    mounted = true;
    for (const cb of mountedCbs.splice(0)) cb();
  });

  return {
    read: () => current(),
    write: async (patch) => {
      if (!scope && !service) {
        throw new Error("dsh-web-tools settings namespace is not mounted");
      }
      Object.assign(configured, patch);
      if (scope) {
        await scope.update(patch);
      } else if (typeof service?.update === "function") {
        await service.update(SETTINGS_NS, patch);
      }
    },
    onMounted: (cb) => {
      if (mounted) {
        cb();
      } else {
        mountedCbs.push(cb);
      }
    },
  };
}
