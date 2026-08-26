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
import { createSearchProvider, createFetchProvider, createPoolStore, PROVIDER_ID, WebToolsWebError } from "./registry.ts";
import { registerRoutes } from "./routes.ts";
import { Stats } from "./stats.ts";
import { CURRENT_VERSION, compareVersions } from "../shared/version.ts";
import type { VersionCheckView } from "../shared/api-types.ts";
import { buildPool, selectIndex, markUsed, markUnhealthy, resetHealth } from "./pool.ts";
import { credRefOf, getProvider, PROVIDER_LIST, quotaOf } from "./providers/index.ts";
import { seedBraveQuota, setBraveQuotaPersist } from "./providers/brave.ts";
import type { ProviderError } from "./providers/types.ts";
import { isKeylessSelfHosted } from "./providers/types.ts";
import type { QuotaSnapshot } from "./quota.ts";
import { mergePoolQuota } from "./quota.ts";
import { fetchWithProxy, proxyStatus } from "./fetch-proxy.ts";
import { installSearchModeRuntime, SearchModeRuntime, createSearchModeMessages } from "./search-mode-runtime.ts";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { createProviderHealthStore } from "./provider-health.ts";

import { SpecializedSourceRegistry } from "./sources/registry.ts";
import { XiaohongshuSource } from "./sources/xiaohongshu.ts";
import { XSource } from "./sources/x.ts";
import { createNativeBrowserRuntime } from "./browser/index.ts";
import { extractSearchHints } from "./search-hints.ts";
import type { SourceFetchOutcome } from "./sources/types.ts";

/** Cordis plugin name used by loader diagnostics. */
export const name = "dsh-web-tools";

/** Services required by this plugin. */
export const inject = ["webServer", "webRuntime", "settings", "credentials", "web", "agents", "commands"];

/**
 * Plugin-level config: the same schemastery schema as the settings namespace.
 * Cordis requires `Config` to be a schema instance (it calls `.validate` when
 * resolving plugin config); an empty object would crash at load.
 */
export const Config = PluginConfig;

const RELEASES_API = "https://api.github.com/repos/A3Boy/dsh-web-tools/releases/latest";
const RELEASES_URL = "https://github.com/A3Boy/dsh-web-tools/releases";
const VERSION_CACHE_MS = 6 * 60 * 60 * 1000;
let versionCache: { fetchedAt: number; value: VersionCheckView } | null = null;

export function toRoutedFetchResponse(url: string, outcome: SourceFetchOutcome) {
  if (outcome.error) {
    const error = new WebToolsWebError(
      `platform fetch failed (${outcome.error.code}): ${outcome.error.message}`,
    );
    if (outcome.error.code === "aborted") error.code = "WEB_ABORTED";
    throw error;
  }

  const item = outcome.item;
  const rawContent = item?.text?.trim();
  if (!item || !rawContent) {
    throw new WebToolsWebError(`platform fetch returned empty content for ${url}`);
  }

  const sections: string[] = [];
  if (item.title?.trim() && !rawContent.startsWith(item.title.trim())) {
    sections.push(`# ${item.title.trim()}`);
  }

  const metadata: string[] = [];
  const author = item.author?.handle || item.author?.name;
  if (author) metadata.push(`Author: ${author}`);
  if (item.publishedAt) metadata.push(`Published: ${item.publishedAt}`);
  const engagement = [
    typeof item.likes === "number" ? `likes ${item.likes}` : undefined,
    typeof item.collects === "number" ? `collects ${item.collects}` : undefined,
    typeof item.retweets === "number" ? `retweets ${item.retweets}` : undefined,
    typeof item.replies === "number" ? `comments/replies ${item.replies}` : undefined,
  ].filter(Boolean);
  if (engagement.length > 0) metadata.push(`Engagement: ${engagement.join(", ")}`);
  if (metadata.length > 0) sections.push(metadata.join("\n"));
  sections.push(rawContent);
  if (item.images?.length) sections.push(`Images: ${item.images.length} attached`);
  const content = sections.join("\n\n");

  return {
    url,
    statusCode: 200,
    body: { kind: "text" as const, content },
    truncated: false,
  };
}

/** Release lookup is best-effort: startup and settings must work offline. */
async function checkVersion(): Promise<VersionCheckView> {
  if (versionCache && Date.now() - versionCache.fetchedAt < VERSION_CACHE_MS) return versionCache.value;

  const fallback: VersionCheckView = { currentVersion: CURRENT_VERSION, updateAvailable: false };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    timer.unref?.();
    let response: Response;
    try {
      response = await fetchWithProxy(RELEASES_API, {
        signal: controller.signal,
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": `dsh-web-tools/${CURRENT_VERSION}`,
        },
      });
    } finally {
      clearTimeout(timer);
    }

    // A repository without releases is a valid "no update" state.
    if (response.status === 404) {
      versionCache = { fetchedAt: Date.now(), value: fallback };
      return fallback;
    }
    if (!response.ok) throw new Error(`GitHub releases returned HTTP ${response.status}`);

    const release = await response.json() as {
      tag_name?: unknown;
      name?: unknown;
      html_url?: unknown;
      published_at?: unknown;
      draft?: unknown;
      prerelease?: unknown;
    };
    const latestVersion = typeof release.tag_name === "string" ? release.tag_name.replace(/^v/i, "") : "";
    if (!latestVersion || release.draft === true || release.prerelease === true) return fallback;

    const value: VersionCheckView = {
      currentVersion: CURRENT_VERSION,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, CURRENT_VERSION) > 0,
      releaseUrl: typeof release.html_url === "string" ? release.html_url : RELEASES_URL,
      releaseName: typeof release.name === "string" && release.name.trim() ? release.name : `v${latestVersion}`,
      publishedAt: typeof release.published_at === "string" ? release.published_at : undefined,
    };
    versionCache = { fetchedAt: Date.now(), value };
    return value;
  } catch {
    // Do not cache transient network failures; the next settings open can retry.
    return fallback;
  }
}

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
      searchRoutingPolicy: cfg.searchRoutingPolicy,
      providerBaseUrls: cfg.providerBaseUrls,
      enabledProviders: cfg.providerEnabled,
      providerOptions: cfg.providerOptions,
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

  // ONE shared health store so search + fetch respect the same cooldowns.
  const healthStore = createProviderHealthStore();

  const sourceRegistry = new SpecializedSourceRegistry();

  const generalSearchProvider = createSearchProvider(resolveRuntimeConfig, resolveKeys, {
    record: (e) => stats.record({ ...e, at: Date.now() }),
  }, undefined, poolStore, healthStore);

  const generalFetchProvider = createFetchProvider(resolveRuntimeConfig, resolveKeys, undefined, poolStore, healthStore);

  sourceRegistry.setFallbackProviders(generalSearchProvider, generalFetchProvider);

  // Sync platformEnabled from config on boot and live updates
  configHandle.onMounted(() => {
    const cfg = readConfig();
    if (cfg.platformEnabled) {
      sourceRegistry.setPlatformEnabled(cfg.platformEnabled);
    }
  });

  // Wrap search provider with SpecializedSourceRouter for XHS / X transparent platform handling
  const routedSearchProvider = {
    id: PROVIDER_ID,
    available: () => generalSearchProvider.available(),
    search: async (request: { query: string; maxResults?: number }, signal?: AbortSignal) => {
      const outcome = await sourceRegistry.search(
        request.query,
        { maxResults: request.maxResults, hints: extractSearchHints(request.query) },
        signal,
      );
      if (outcome.error) {
        throw new Error(`[${outcome.error.code}] ${outcome.error.message}`);
      }
      return {
        sources: outcome.items.map((item) => ({
          url: item.url,
          title: item.title,
          snippet: item.snippet,
          publishedAt: item.publishedAt,
        })),
        truncated: false,
      };
    },
  };
  ctx.web.registerSearchProvider(routedSearchProvider as never);

  // Wrap fetch provider with SpecializedSourceRouter
  const routedFetchProvider = {
    id: `${PROVIDER_ID}-fetch`,
    available: () => generalFetchProvider.available(),
    fetch: async (request: { url: string }, signal?: AbortSignal) => {
      const outcome = await sourceRegistry.fetch(request.url, signal);
      return toRoutedFetchResponse(request.url, outcome);
    },
  };
  ctx.web.registerFetchProvider(routedFetchProvider as never);

  // Specialized Sources: Register Xiaohongshu and Twitter/X with NativeBrowserRuntime
  const nativeRuntime = createNativeBrowserRuntime();
  const xhsSource = new XiaohongshuSource(nativeRuntime);
  const xSource = new XSource(nativeRuntime);
  sourceRegistry.registerSource(xhsSource);
  sourceRegistry.registerSource(xSource);

  // Hook NativeBrowserRuntime lifecycle into Cordis effect
  ctx.effect(
    () => {
      return () => {
        nativeRuntime.dispose().catch(() => {});
      };
    },
    "dsh-web-tools: native browser runtime",
  );

  /** Run one real minimal search through a single provider (test connection). */
  async function testProviderSearch(providerName: string, query: string) {
    const adapter = getProvider(providerName);
    const started = Date.now();
    try {
      // Keyless self-hosted providers (SearXNG) work without any key.
      let key = "";
      if (!isKeylessSelfHosted(adapter)) {
        // Use the SHARED pool store so a failed probe marks the tested key
        // unhealthy — the card's per-key health must reflect reality, not a
        // fresh pool where every key always looks healthy.
        const entries = await poolStore.poolOf(providerName);
        if (entries.length === 0) throw Object.assign(new Error("no API key configured"), { code: "config" });
        if (!entries.some((e) => e.healthy)) resetHealth(entries);
        const index = selectIndex(entries);
        const entry = entries[index];
        key = (entry?.key ?? "").trim();
        try {
          const outcome = await adapter.search(query, 1, key, readConfig().providerBaseUrls[providerName]);
          markUsed(entries, index);
          if (!entry.healthy) entry.healthy = true;
          const latencyMs = Date.now() - started;
          return {
            ok: true,
            latencyMs,
            resultCount: outcome.sources.length,
            title: outcome.sources[0]?.title,
          };
        } catch (e) {
          // Same policy as the executor: only an auth failure indicts the key.
          const err = toProviderError(e);
          if (err.code === "auth") markUnhealthy(entries, index);
          throw err;
        }
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
      const result = await routedSearchProvider.search(
        { query, maxResults: 5 },
        undefined, // no caller signal for a manual card test
      );
      return {
        ok: true,
        backend: (result as unknown as { backend?: string }).backend,
        latencyMs: Date.now() - started,
        resultCount: result.sources.length,
        results: result.sources.slice(0, 5).map((s: any) => ({ title: s.title ?? s.url, url: s.url, snippet: s.snippet ?? "" })),
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

  /** Quota cache: { fetchedAt, per provider snapshot }. */
  let quotaCache: { fetchedAt: number; quotas: Record<string, QuotaSnapshot> } | null = null;
  const QUOTA_CACHE_MS = 5 * 60 * 1000; // 5 min — quota is display-only, no 30s polling
  const QUOTA_TIMEOUT_MS = 8000;

  async function describeQuotas(force = false): Promise<Record<string, QuotaSnapshot>> {
    if (!force && quotaCache && Date.now() - quotaCache.fetchedAt < QUOTA_CACHE_MS) return quotaCache.quotas;

    const cfg = readConfig();
    const chainNames = new Set<string>([cfg.defaultProvider, ...cfg.fallbackOrder]);
    const summary = stats.summary();

    // Read all credentials in parallel ONCE
    const credentialEntries = await Promise.all(
      PROVIDER_LIST.map(async (meta) => {
        const ref = credRefOf(meta.name);
        const cred = await readCredential(ctx, ref);
        return { meta, ref, cred };
      }),
    );

    const wanted = new Set<string>(chainNames);
    for (const { meta, cred } of credentialEntries) {
      if ((cred.value ?? "").trim().length > 0) wanted.add(meta.name);
    }

    const credMap = new Map(credentialEntries.map((e) => [e.meta.name, e.cred]));

    // Parallel, timeout-bounded, only providers that can report quota.
    const results = await Promise.allSettled(
      PROVIDER_LIST.filter((meta) => wanted.has(meta.name)).map(async (meta): Promise<[string, QuotaSnapshot]> => {
        const cred = credMap.get(meta.name);
        const localSearches = summary.byProvider[meta.name]?.success ?? 0;
        // Multi-key pool: query EVERY key and merge — the card shows the
        // TOTAL pool balance, not one key's. Each key is authenticated
        // separately (never join the raw string).
        const keys = buildPool(cred?.value ?? "").map((e) => e.key);
        if (keys.length === 0) {
          const snapshot = await withTimeoutMs(
            quotaOf(meta.name, "", cfg.providerBaseUrls[meta.name], localSearches),
            QUOTA_TIMEOUT_MS,
          );
          return [meta.name, snapshot];
        }
        const perKey = await Promise.allSettled(
          keys.map((k) =>
            withTimeoutMs(quotaOf(meta.name, k, cfg.providerBaseUrls[meta.name], localSearches), QUOTA_TIMEOUT_MS),
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

  // ---- Brave quota persistence --------------------------------------------
  // Brave has no quota endpoint; its only quota signal is the X-RateLimit-*
  // header captured during a real search. Persist those snapshots into the
  // settings namespace so a restart does not forget the last known balance.
  // Seeding MUST wait for the settings namespace (ctx.inject is async) — in
  // the synchronous apply() body readConfig() would only return defaults.
  configHandle.onMounted(() => {
    const braveCache = readConfig().braveQuotaCache ?? {};
    for (const [key, snap] of Object.entries(braveCache)) {
      if (key && snap && typeof snap === "object") seedBraveQuota(key, snap as QuotaSnapshot);
    }
  });
  setBraveQuotaPersist((apiKey, snapshot) => {
    void configHandle
      .write({ braveQuotaCache: { ...readConfig().braveQuotaCache, [apiKey]: snapshot } })
      .catch(() => {});
  });

  // ---- Search Mode (per-session "required web search" turn policy) ---------
  // Host-owned state riding the provider seam: `available()` means the search
  // provider service is enabled with a chain provider. Messages use the
  // OFFICIAL @deepseek-ai/dsh-llm createUserMessage ({ content, source }):
  // required = durable snapshot section, correction = one-shot notice.
  const searchModeMessages = createSearchModeMessages((input) => createUserMessage(input as never));
  const searchModeRuntime = new SearchModeRuntime(() => routedSearchProvider.available());
  ctx.effect(
    () =>
      installSearchModeRuntime(
        ctx,
        { searchAvailable: () => routedSearchProvider.available() },
        searchModeRuntime,
        searchModeMessages,
      ),
    "dsh-web-tools: search-mode runtime",
  );

  // The routes expose the same runtime map to the button / slash commands.
  const searchMode = {
    view: (sessionId: string) => searchModeRuntime.view(sessionId),
    set: (sessionId: string, mode: "auto" | "required") => {
      searchModeRuntime.setMode(sessionId, mode);
      return searchModeRuntime.view(sessionId);
    },
  };

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
        nativeRuntime,
        sourceRegistry,
        checkVersion,
        poolEntries: (providerName) => poolStore.poolOf(providerName),
        proxyStatus,
        searchMode,
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
