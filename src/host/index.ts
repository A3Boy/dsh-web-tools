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
import { installConfig, type WebToolsSettings } from "./config.ts";
import { createSearchProvider, createFetchProvider, PROVIDER_ID } from "./registry.ts";
import { registerRoutes } from "./routes.ts";
import { Stats } from "./stats.ts";
import { buildPool, selectIndex, markUsed } from "./pool.ts";
import { classifyFailure, fallbackChain } from "./fallback.ts";
import { credRefOf, getProvider, PROVIDER_LIST, quotaOf } from "./providers/index.ts";
import type { ProviderError } from "./providers/types.ts";
import type { QuotaSnapshot } from "./quota.ts";

/** Cordis plugin name used by loader diagnostics. */
export const name = "dsh-web-tools";

/** Services required by this plugin. */
export const inject = ["webServer", "webRuntime", "settings", "credentials", "web"];

/** Plugin-level config (all knobs live in the settings namespace). */
export const Config = {};

/** Resolve one credential ref's state + optional value (Host side only). */
async function readCredential(ctx: WebToolsContext, ref: string): Promise<{ configured: boolean; source?: string; writable: boolean; value?: string }> {
  try {
    const credentials = ctx.credentials;
    if (!credentials?.resolve) return { configured: false, writable: true };
    const resolved = await credentials.resolve(ref);
    const value = resolved?.value;
    return {
      configured: typeof value === "string" && value.length > 0,
      source: resolved?.source,
      writable: true,
      ...(typeof value === "string" ? { value } : {}),
    };
  } catch {
    return { configured: false, writable: true };
  }
}

async function writeCredential(ctx: WebToolsContext, ref: string, value: string) {
  const credentials = ctx.credentials;
  if (!credentials?.set) throw new Error("credentials service unavailable");
  await credentials.set(ref, value);
}

export function apply(ctx: WebToolsContext) {
  const stats = new Stats();
  const configHandle = installConfig(ctx);
  const readConfig = () => configHandle.read();

  // ---- ctx.web search + fetch providers ----------------------------------
  const resolveRuntimeConfig = () => {
    const cfg = readConfig();
    return {
      enabled: cfg.enabled !== false,
      defaultProvider: cfg.defaultProvider,
      maxResults: cfg.maxResults,
      searchTimeoutMs: cfg.searchTimeoutMs,
      fallbackOrder: cfg.fallbackOrder,
      maxFallbackProviders: cfg.maxFallbackProviders,
      providerBaseUrls: cfg.providerBaseUrls,
      enabledProviders: cfg.providerEnabled,
    };
  };
  const resolveKeys = async (providerName: string) => {
    const ref = credRefOf(providerName);
    const cred = await readCredential(ctx, ref);
    return cred.value ?? "";
  };

  const provider = createSearchProvider(resolveRuntimeConfig, resolveKeys, {
    record: (e) => stats.record({ ...e, at: Date.now() }),
  });
  ctx.web.registerSearchProvider(provider as never);

  const fetchProvider = createFetchProvider(resolveRuntimeConfig, resolveKeys);
  ctx.web.registerFetchProvider(fetchProvider as never);

  /** Run one real minimal search through a single provider (test connection). */
  async function testProviderSearch(providerName: string, query: string) {
    const adapter = getProvider(providerName);
    const ref = credRefOf(providerName);
    const cred = await readCredential(ctx, ref);
    const entries = buildPool(cred.value ?? "");
    const started = Date.now();
    try {
      const index = selectIndex(entries);
      const outcome = await adapter.search(query, 1, entries[index]?.key ?? "", readConfig().providerBaseUrls[providerName]);
      markUsed(entries, index);
      const latencyMs = Date.now() - started;
      return {
        ok: true,
        latencyMs,
        resultCount: outcome.sources.length,
        title: outcome.sources[0]?.title,
      };
    } catch (e) {
      const err = toProviderError(e);
      return { ok: false, error: { code: err.code, message: err.message } };
    }
  }

  /** Run the full search path (default provider + fallback) for the card. */
  async function testFullSearch(query: string, overrideProvider?: string) {
    const cfg = readConfig();
    const chain = overrideProvider
      ? [overrideProvider]
      : fallbackChain({
          defaultProvider: cfg.defaultProvider,
          fallbackOrder: cfg.fallbackOrder,
          maxFallbackProviders: cfg.maxFallbackProviders,
        });
    const attempts: Array<{ provider: string; outcome: string; latencyMs?: number }> = [];
    let lastError: ProviderError | undefined;

    for (const providerName of chain) {
      const adapter = getProvider(providerName);
      const ref = credRefOf(providerName);
      const cred = await readCredential(ctx, ref);
      const entries = buildPool(cred.value ?? "");
      const started = Date.now();
      try {
        const index = selectIndex(entries);
        const outcome = await adapter.search(query, cfg.maxResults, entries[index]?.key ?? "", cfg.providerBaseUrls[providerName]);
        markUsed(entries, index);
        const latencyMs = Date.now() - started;
        attempts.push({ provider: providerName, outcome: "success", latencyMs });
        stats.record({ provider: providerName, outcome: "success", latencyMs, at: Date.now() });
        return {
          ok: true,
          backend: providerName,
          latencyMs,
          resultCount: outcome.sources.length,
          results: outcome.sources.slice(0, 5).map((s) => ({ title: s.title ?? s.url, url: s.url, snippet: s.snippet ?? "" })),
          attempts,
        };
      } catch (e) {
        const err = toProviderError(e);
        const latencyMs = Date.now() - started;
        attempts.push({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
        stats.record({ provider: providerName, outcome: `failed:${err.code}`, latencyMs, at: Date.now() });
        lastError = err;
        if (classifyFailure(err) === "non-retryable") break;
      }
    }
    return {
      ok: false,
      attempts,
      error: { code: lastError?.code ?? "unavailable", message: lastError?.message ?? "no usable provider" },
    };
  }

  /** Quota snapshots for every provider (authoritative where available). */
  async function describeQuotas(): Promise<Record<string, QuotaSnapshot>> {
    const out: Record<string, QuotaSnapshot> = {};
    for (const meta of PROVIDER_LIST) {
      const ref = credRefOf(meta.name);
      const cred = await readCredential(ctx, ref);
      const key = cred.value ?? "";
      const summary = stats.summary();
      const localSearches = summary.byProvider[meta.name]?.success ?? 0;
      const localUsdCents = localSearches > 0 ? Math.max(1, Math.round((localSearches * 700) / 1000)) : undefined;
      try {
        out[meta.name] = await quotaOf(meta.name, key, readConfig().providerBaseUrls[meta.name], localUsdCents);
      } catch (e) {
        out[meta.name] = {
          supported: false,
          authoritative: false,
          unit: "unknown",
          source: "dashboard",
          fetchedAt: Date.now(),
          note: `Quota check failed: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
    return out;
  }

  // ---- fenced HTTP routes for the card ------------------------------------
  ctx.effect(
    () =>
      registerRoutes(ctx, {
        readConfig: () => readConfig() as unknown as Record<string, unknown>,
        writeConfig: (patch) => {
          configHandle.write(patch as Partial<WebToolsSettings>);
        },
        readCredential: (ref) => readCredential(ctx, ref),
        writeCredential: (ref, value) => writeCredential(ctx, ref, value),
        testProviderSearch,
        testFullSearch,
        describeQuotas,
      }),
    "dsh-web-tools: /web-tools/api routes",
  );
}

function toProviderError(error: unknown): ProviderError {
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as ProviderError).code === "string") {
    return error as ProviderError;
  }
  const message = error instanceof Error ? error.message : String(error);
  const err = new Error(message) as ProviderError;
  err.code = "network";
  return err;
}

export { PROVIDER_ID };
