/**
 * dsh-web-tools — search executor: account pools + deterministic fallback.
 *
 * Implements the DSH `WebSearchProvider` contract (`id`, `available()`,
 * `search(request, signal)`) registered on `ctx.web`. The seam's model-facing
 * `web_search`/`web_fetch` tools (from `dsh-tool-web`) execute through this.
 * The provider contracts are restated structurally (no dsh-web import) so the
 * plugin resolves outside the monorepo, following the better-sidebar pattern.
 * @module
 */
import { classifyFailure, fallbackChain } from "./fallback.ts";
import { buildPool, markUnhealthy, markUsed, poolSummary, resetHealth, selectIndex, type PoolEntry } from "./pool.ts";
import { getProvider, PROVIDER_LIST } from "./providers/index.ts";
import type { ProviderError } from "./providers/types.ts";
import { isExhausted, type QuotaSnapshot } from "./quota.ts";

/** Stable provider id registered on ctx.web (the `web` row's searchProvider). */
export const PROVIDER_ID = "dsh-web-tools";

/** Structural mirror of the seam's WebSearchProvider contract. */
export interface WebSearchProviderLike {
  id: string;
  available(): boolean;
  search(request: { query: string; maxResults?: number }, signal?: AbortSignal): Promise<{
    content?: string;
    sources: Array<{ url: string; title?: string; snippet?: string; publishedAt?: string }>;
    truncated: boolean;
  }>;
}

/** Structural mirror of the seam's WebFetchProvider contract. */
export interface WebFetchProviderLike {
  id: string;
  available(): boolean;
  fetch(request: { url: string }, signal?: AbortSignal): Promise<{
    url: string;
    statusCode: number;
    body: { kind: "html" | "text"; content: string };
    truncated: boolean;
  }>;
}

/** A classified failure the executor throws (WebError-compatible shape). */
export class WebToolsWebError extends Error {
  code = "WEB_PROVIDER_ERROR";
  attempts?: Array<{ provider: string; outcome: string; latencyMs?: number }>;
}

/** Runtime configuration resolved per search (snapshot per operation). */
export interface WebToolsRuntimeConfig {
  enabled: boolean;
  defaultProvider: string;
  maxResults: number;
  searchTimeoutMs: number;
  fallbackOrder: string[];
  maxFallbackProviders: number;
  providerBaseUrls: Record<string, string>;
  enabledProviders: Record<string, boolean>;
  /** Optional per-provider quota snapshots (used only to skip known-exhausted). */
  quotas?: Record<string, QuotaSnapshot>;
}

/** Live per-provider key pools, keyed by provider name. */
export type Pools = Record<string, PoolEntry[]>;

/** Build a WebToolsSearchProvider for `ctx.web.registerSearchProvider`. */
export function createSearchProvider(
  resolveConfig: () => WebToolsRuntimeConfig,
  resolveKeys: (providerName: string) => Promise<string>,
  stats: {
    record: (entry: { provider: string; outcome: string; latencyMs: number }) => void;
  },
): WebSearchProviderLike {
  const pools: Pools = {};

  function poolOf(providerName: string): PoolEntry[] {
    if (!pools[providerName]) pools[providerName] = [];
    return pools[providerName];
  }

  /** Rebuild a provider's pool from its credential (called each search; keys may rotate). */
  async function refreshPool(providerName: string): Promise<PoolEntry[]> {
    const raw = await resolveKeys(providerName);
    const next = buildPool(raw);
    const prev = poolOf(providerName);
    // keep usage counters for keys that persist, so rotation doesn't reset fairness
    const byKey = new Map(prev.map((e) => [e.key, e]));
    for (const e of next) {
      const old = byKey.get(e.key);
      if (old) {
        e.uses = old.uses;
        e.healthy = old.healthy;
      }
    }
    pools[providerName] = next;
    return next;
  }

  return {
    id: PROVIDER_ID,

    available() {
      const cfg = resolveConfig();
      if (!cfg.enabled) return false;
      return PROVIDER_LIST.some((p) => {
        if (cfg.enabledProviders[p.name] === false) return false;
        return cfg.defaultProvider === p.name || cfg.fallbackOrder.includes(p.name);
      });
    },

    async search(request: { query: string; maxResults?: number }, signal?: AbortSignal) {
      const cfg = resolveConfig();
      if (!cfg.enabled) throw new WebToolsWebError("web search is disabled");
      const maxResults = request.maxResults ?? cfg.maxResults;
      const chain = fallbackChain({
        defaultProvider: cfg.defaultProvider,
        fallbackOrder: cfg.fallbackOrder,
        maxFallbackProviders: cfg.maxFallbackProviders,
      });

      const attempts: Array<{ provider: string; outcome: string; latencyMs?: number }> = [];
      let lastError: ProviderError | undefined;

      for (const providerName of chain) {
        if (cfg.enabledProviders[providerName] === false) continue;
        // Quota-aware skip: only authoritative snapshots are trusted; a
        // known-exhausted provider is skipped without burning a request.
        const quota = cfg.quotas?.[providerName];
        if (isExhausted(quota)) {
          attempts.push({ provider: providerName, outcome: "skipped-exhausted" });
          continue;
        }
        const adapter = getProvider(providerName);
        const entries = await refreshPool(providerName);
        if (entries.length === 0 && adapter.needsBaseUrl && !adapter.fetchCapable) {
          // keyless self-hosted (SearXNG) still usable without keys
        } else if (entries.length === 0) {
          attempts.push({ provider: providerName, outcome: "skipped-no-keys" });
          continue;
        }

        // Reset health once when the whole pool is exhausted.
        if (entries.length > 0 && !entries.some((e) => e.healthy)) resetHealth(entries);

        const index = selectIndex(entries);
        const entry = entries[index];
        const started = Date.now();
        try {
          const outcome = await withTimeout(
            adapter.search(request.query, maxResults, entry?.key ?? "", cfg.providerBaseUrls[providerName], signal),
            cfg.searchTimeoutMs,
          );
          if (entry) markUsed(entries, index);
          const latencyMs = Date.now() - started;
          attempts.push({ provider: providerName, outcome: "success", latencyMs });
          stats.record({ provider: providerName, outcome: "success", latencyMs });
          return {
            ...outcome,
            truncated: false,
            attempts,
            backend: providerName,
          };
        } catch (error) {
          if (entry) markUnhealthy(entries, index);
          const err = toProviderError(error);
          const latencyMs = Date.now() - started;
          attempts.push({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
          stats.record({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
          lastError = err;
          const decision = classifyFailure(err);
          // Caller cancellation terminates the whole chain — never fall back.
          if (decision === "terminal") throw toWebError(error);
          if (decision === "non-retryable") break;
          // retryable → fall through to the next provider in the chain
        }
      }

      const reason = lastError
        ? `${lastError.code}: ${lastError.message}`
        : "no usable provider";
      const err = new WebToolsWebError(`web search failed after ${attempts.length} attempt(s): ${reason}`);
      err.attempts = attempts;
      throw err;
    },
  };
}

/**
 * Build a `WebFetchProvider` for `ctx.web.registerFetchProvider`. V1 routes
 * fetch through the default provider's native extract endpoint; providers
 * without native fetch fail with a classified error.
 */
export function createFetchProvider(
  resolveConfig: () => WebToolsRuntimeConfig,
  resolveKeys: (providerName: string) => Promise<string>,
): WebFetchProviderLike {
  const pools: Pools = {};
  const poolOf = (providerName: string): PoolEntry[] => (pools[providerName] ??= []);
  const refreshPool = async (providerName: string): Promise<PoolEntry[]> => {
    const raw = await resolveKeys(providerName);
    const next = buildPool(raw);
    pools[providerName] = next;
    return next;
  };

  return {
    id: `${PROVIDER_ID}-fetch`,
    available() {
      const cfg = resolveConfig();
      if (!cfg.enabled) return false;
      const chain = fallbackChain({
        defaultProvider: cfg.defaultProvider,
        fallbackOrder: cfg.fallbackOrder,
        maxFallbackProviders: cfg.maxFallbackProviders,
      });
      return chain.some((name) => {
        if (cfg.enabledProviders[name] === false) return false;
        const adapter = getProvider(name);
        return adapter.fetchCapable;
      });
    },
    async fetch(request: { url: string }, signal?: AbortSignal) {
      const cfg = resolveConfig();
      const chain = fallbackChain({
        defaultProvider: cfg.defaultProvider,
        fallbackOrder: cfg.fallbackOrder,
        maxFallbackProviders: cfg.maxFallbackProviders,
      });
      let lastError: ProviderError | undefined;

      for (const providerName of chain) {
        if (cfg.enabledProviders[providerName] === false) continue;
        const adapter = getProvider(providerName);
        if (!adapter.fetchCapable) continue; // not a fetch backend, skip
        const entries = await refreshPool(providerName);
        if (entries.length === 0) continue; // no credentials for this backend
        const index = selectIndex(entries);
        const entry = entries[index];
        try {
          const { text } = await withTimeout(
            adapter.fetch(request.url, entry?.key ?? "", cfg.providerBaseUrls[providerName], signal),
            cfg.searchTimeoutMs,
          );
          if (entry) markUsed(entries, index);
          return {
            url: request.url,
            statusCode: 200,
            body: { kind: "text" as const, content: text },
            truncated: false,
            backend: providerName,
          };
        } catch (error) {
          if (entry) markUnhealthy(entries, index);
          const err = toProviderError(error);
          lastError = err;
          const decision = classifyFailure(err);
          if (decision === "terminal") throw toWebError(error);
          if (decision === "non-retryable") break;
          // retryable → next fetch-capable provider in the chain
        }
      }
      const reason = lastError
        ? `${lastError.code}: ${lastError.message}`
        : "no fetch-capable provider";
      throw new WebToolsWebError(`web fetch failed: ${reason}`);
    },
  };
}

/** Convert any thrown value into a classified ProviderError. */
function toProviderError(error: unknown): ProviderError {
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as ProviderError).code === "string") {
    return error as ProviderError;
  }
  const message = error instanceof Error ? error.message : String(error);
  const err = new Error(message) as ProviderError;
  err.code = "network";
  return err;
}

/** Wrap an unknown failure from a provider call into a WebToolsWebError. */
function toWebError(error: unknown): WebToolsWebError {
  const p = toProviderError(error);
  const err = new WebToolsWebError(p.message);
  // preserve cancellation semantics: aborted stays aborted
  if (p.code === "aborted") err.code = "WEB_ABORTED";
  return err;
}

/** Race a promise against a timeout; abort-aware. */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(providerErrorOf("timeout", `provider timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function providerErrorOf(code: string, message: string): ProviderError {
  const err = new Error(message) as ProviderError;
  err.code = code;
  return err;
}
