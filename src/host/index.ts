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
import { Config as PluginConfig, installConfig, type WebToolsSettings } from "./config.ts";
import { createSearchProvider, createFetchProvider, createPoolStore, PROVIDER_ID } from "./registry.ts";
import { registerRoutes } from "./routes.ts";
import { Stats } from "./stats.ts";
import { buildPool, selectIndex, markUsed } from "./pool.ts";
import { credRefOf, getProvider, PROVIDER_LIST, quotaOf } from "./providers/index.ts";
import type { ProviderError } from "./providers/types.ts";
import { isKeylessSelfHosted } from "./providers/types.ts";
import type { QuotaSnapshot } from "./quota.ts";
import { mergePoolQuota } from "./quota.ts";

/** Cordis plugin name used by loader diagnostics. */
export const name = "dsh-web-tools";

/** Services required by this plugin. */
export const inject = ["webServer", "webRuntime", "settings", "credentials", "web"];

/**
 * Plugin-level config: the same schemastery schema as the settings namespace.
 * Cordis requires `Config` to be a schema instance (it calls `.validate` when
 * resolving plugin config); an empty object would crash at load.
 */
export const Config = PluginConfig;

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

/**
 * Write a credential value. An empty string UNSETS the credential — the
 * credentials-local provider refuses to store empty values ("use unset"),
 * so removing the last key must unset rather than set("").
 */
async function writeCredential(ctx: WebToolsContext, ref: string, value: string) {
  const credentials = ctx.credentials;
  if (!credentials?.set || !credentials?.unset) throw new Error("credentials service unavailable");
  if (typeof value === "string" && value.length === 0) {
    await credentials.unset(ref);
    return;
  }
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
      providerAttemptTimeoutMs: cfg.providerAttemptTimeoutMs,
      fallbackOrder: cfg.fallbackOrder,
      providerBaseUrls: cfg.providerBaseUrls,
      enabledProviders: cfg.providerEnabled,
    };
  };
  const resolveKeys = async (providerName: string) => {
    const ref = credRefOf(providerName);
    const cred = await readCredential(ctx, ref);
    return cred.value ?? "";
  };

  // ONE shared pool store for search + fetch: they see the same key usage
  // and health, and rebuild only when a credential actually changes.
  const poolStore = createPoolStore(resolveKeys);

  const provider = createSearchProvider(resolveRuntimeConfig, resolveKeys, {
    record: (e) => stats.record({ ...e, at: Date.now() }),
  }, undefined, poolStore);
  ctx.web.registerSearchProvider(provider as never);

  const fetchProvider = createFetchProvider(resolveRuntimeConfig, resolveKeys, undefined, poolStore);
  ctx.web.registerFetchProvider(fetchProvider as never);

  /** Run one real minimal search through a single provider (test connection). */
  async function testProviderSearch(providerName: string, query: string) {
    const adapter = getProvider(providerName);
    const ref = credRefOf(providerName);
    const cred = await readCredential(ctx, ref);
    const started = Date.now();
    try {
      // Keyless self-hosted providers (SearXNG) work without any key.
      let key = "";
      if (!isKeylessSelfHosted(adapter)) {
        const entries = buildPool(cred.value ?? "");
        if (entries.length === 0) throw Object.assign(new Error("no API key configured"), { code: "config" });
        const index = selectIndex(entries);
        key = entries[index].key;
        markUsed(entries, index);
      }
      const outcome = await adapter.search(query, 1, key, readConfig().providerBaseUrls[providerName]);
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

  /** Run the REAL search path (default provider + fallback) for the card.
   *  Delegates to the same provider used by agent web_search, so Test Search
   *  never drifts from production behavior. */
  /** Run the REAL search path (default provider + fallback) for the card.
   *  Delegates to the same provider used by agent web_search, so Test Search
   *  never drifts from production behavior. Total latency measured here. */
  async function testFullSearch(query: string) {
    const started = Date.now();
    try {
      const result = await provider.search(
        { query, maxResults: 5 },
        undefined, // no caller signal for a manual card test
      );
      return {
        ok: true,
        backend: (result as unknown as { backend?: string }).backend,
        latencyMs: Date.now() - started,
        resultCount: result.sources.length,
        results: result.sources.slice(0, 5).map((s) => ({ title: s.title ?? s.url, url: s.url, snippet: s.snippet ?? "" })),
        attempts: (result as unknown as { attempts?: Array<{ provider: string; outcome: string; latencyMs?: number }> }).attempts,
      };
    } catch (e) {
      const err = toProviderError(e);
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: { code: err.code, message: err.message },
      };
    }
  }

  /** Quota snapshots for every provider (authoritative where available). */
  /** Quota cache: { fetchedAt, per provider snapshot }. */
  let quotaCache: { fetchedAt: number; quotas: Record<string, QuotaSnapshot> } | null = null;
  const QUOTA_CACHE_MS = 5 * 60 * 1000; // 5 min — quota is display-only, no 30s polling
  const QUOTA_TIMEOUT_MS = 8000;

  async function describeQuotas(force = false): Promise<Record<string, QuotaSnapshot>> {
    if (!force && quotaCache && Date.now() - quotaCache.fetchedAt < QUOTA_CACHE_MS) return quotaCache.quotas;

    const cfg = readConfig();
    const enabledNames = new Set<string>([cfg.defaultProvider, ...cfg.fallbackOrder]);
    const summary = stats.summary();

    // Parallel, timeout-bounded, only providers actually in the search chain.
    const results = await Promise.allSettled(
      PROVIDER_LIST.filter((meta) => enabledNames.has(meta.name)).map(async (meta): Promise<[string, QuotaSnapshot]> => {
        const ref = credRefOf(meta.name);
        const cred = await readCredential(ctx, ref);
        const localSearches = summary.byProvider[meta.name]?.success ?? 0;
        const localUsdCents = localSearches > 0 ? Math.max(1, Math.round((localSearches * 700) / 1000)) : undefined;
        // Multi-key pool: query EVERY key and merge — the card shows the
        // TOTAL pool balance, not one key's. Each key is authenticated
        // separately (never join the raw string).
        const keys = buildPool(cred.value ?? "").map((e) => e.key);
        if (keys.length === 0) {
          const snapshot = await withTimeoutMs(
            quotaOf(meta.name, "", cfg.providerBaseUrls[meta.name], localUsdCents),
            QUOTA_TIMEOUT_MS,
          );
          return [meta.name, snapshot];
        }
        const perKey = await Promise.allSettled(
          keys.map((k) =>
            withTimeoutMs(quotaOf(meta.name, k, cfg.providerBaseUrls[meta.name], localUsdCents), QUOTA_TIMEOUT_MS),
          ),
        );
        const fulfilled = perKey.filter((p): p is PromiseFulfilledResult<QuotaSnapshot> => p.status === "fulfilled").map((p) => p.value);
        if (fulfilled.length === 0) {
          const first = perKey.find((p): p is PromiseRejectedResult => p.status === "rejected");
          throw Object.assign(new Error(`quota check failed: ${first?.reason instanceof Error ? first.reason.message : String(first?.reason)}`), {
            provider: meta.name,
          });
        }
        return [meta.name, mergePoolQuota(fulfilled)];
      }),
    );

    const quotas: Record<string, QuotaSnapshot> = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        const [name, snap] = r.value;
        quotas[name] = snap;
      } else {
        const name = (r.reason as { provider?: string })?.provider ?? "unknown";
        quotas[name] = {
          supported: false,
          authoritative: false,
          unit: "unknown",
          source: "dashboard",
          fetchedAt: Date.now(),
          note: `Quota check failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        };
      }
    }

    quotaCache = { fetchedAt: Date.now(), quotas };
    return quotas;
  }

  // ---- fenced HTTP routes for the card ------------------------------------
  ctx.effect(
    () =>
      registerRoutes(ctx, {
        readConfig: () => readConfig() as unknown as Record<string, unknown>,
        writeConfig: (patch) => configHandle.write(patch as Partial<WebToolsSettings>),
        readCredential: (ref) => readCredential(ctx, ref),
        writeCredential: (ref, value) => writeCredential(ctx, ref, value),
        testProviderSearch,
        testFullSearch,
        describeQuotas,
        poolEntries: (providerName) => poolStore.poolOf(providerName),
      }),
    "dsh-web-tools: /web-tools/api routes",
  );
}

function toProviderError(error: unknown): ProviderError {
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as ProviderError).code === "string") {
    return error as ProviderError;
  }
  const message = describeFetchError(error);
  const err = new Error(message) as ProviderError;
  err.code = "network";
  return err;
}

/**
 * Human-readable network failure. undici's global fetch throws a generic
 * `TypeError: fetch failed` whose real cause (ECONNREFUSED, DNS, TLS,
 * timeout, proxy refusal) sits in `error.cause` — surface it so the settings
 * card shows why a provider is unreachable instead of the bare wrapper.
 */
function describeFetchError(error: unknown): string {
  const top = error instanceof Error ? error.message : String(error);
  let cause: unknown = (error as { cause?: unknown })?.cause;
  const seen = new Set<unknown>([error]);
  while (cause !== undefined && cause !== null && !seen.has(cause)) {
    seen.add(cause);
    if (cause instanceof AggregateError) {
      const first = cause.errors?.[0];
      if (first instanceof Error && first.message && !seen.has(first)) {
        cause = first;
        continue;
      }
    }
    const msg = cause instanceof Error ? cause.message : String(cause);
    if (msg && msg !== top) return `${top}: ${msg}`;
    cause = (cause as { cause?: unknown })?.cause;
  }
  return top;
}

/** Simple timeout wrapper for side-channel quota lookups (no abort needed). */
function withTimeoutMs<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      // Never keep the process alive just for an expired quota timer.
      timer.unref?.();
    }),
  ]);
}

export { PROVIDER_ID };
