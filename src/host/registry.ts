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
import { buildPool, markUnhealthy, markUsed, reserveKey, releaseKey, selectIndex, type PoolEntry } from "./pool.ts";
import { PROVIDERS } from "./providers/index.ts";
import type { ProviderError, ProviderErrorCode } from "./providers/types.ts";
import { isKeylessSelfHosted } from "./providers/types.ts";

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
  /** Per-attempt budget for ONE provider call (the DSH tool owns the overall timeout). */
  providerAttemptTimeoutMs: number;
  fallbackOrder: string[];
  providerBaseUrls: Record<string, string>;
  enabledProviders: Record<string, boolean>;
}

/** Live per-provider key pools, keyed by provider name. */
export type Pools = Record<string, PoolEntry[]>;

/** A per-provider pool with the raw credential it was built from. */
interface PoolSlot {
  raw: string;
  entries: PoolEntry[];
}

/**
 * Shared credential pool store. One instance per plugin; Search and Fetch
 * executors share it so they never fight over separate pools.
 *
 * - Rebuilds a provider's pool ONLY when its credential string changed
 *   (avoids the concurrent-search race of replacing entries out from under an
 *   in-flight request).
 * - Preserves uses/health for keys that persist across rebuilds.
 * - markUsed/markUnhealthy mutate the stable entries array in place.
 */
export function createPoolStore(resolveKeys: (providerName: string) => Promise<string>) {
  const slots = new Map<string, PoolSlot>();

  async function poolOf(providerName: string): Promise<PoolEntry[]> {
    const raw = await resolveKeys(providerName);
    const prev = slots.get(providerName);
    if (prev && prev.raw === raw) return prev.entries;

    const next = buildPool(raw);
    if (prev) {
      const byKey = new Map(prev.entries.map((e) => [e.key, e]));
      for (const e of next) {
        const old = byKey.get(e.key);
        if (old) {
          e.uses = old.uses;
          e.healthy = old.healthy;
        }
      }
    }
    slots.set(providerName, { raw, entries: next });
    return next;
  }

  return { poolOf };
}

export type PoolStore = ReturnType<typeof createPoolStore>;

/** Structural subset of a provider adapter the executor needs (injectable). */
export interface ProviderAdapterLike {
  name: string;
  needsBaseUrl: boolean;
  fetchCapable: boolean;
  search(query: string, maxResults: number | undefined, apiKey: string, baseUrl: string | undefined, signal?: AbortSignal): Promise<{ sources: Array<{ url: string; title?: string; snippet?: string; publishedAt?: string }> }>;
  fetch(url: string, apiKey: string, baseUrl: string | undefined, signal?: AbortSignal): Promise<{ text: string }>;
}

/** Build a WebToolsSearchProvider for `ctx.web.registerSearchProvider`.
 *  `adapterRegistry` is injectable for tests; production uses the global
 *  PROVIDERS map (passed by index.ts via the default). */
export function createSearchProvider(
  resolveConfig: () => WebToolsRuntimeConfig,
  resolveKeys: (providerName: string) => Promise<string>,
  stats: {
    record: (entry: { provider: string; outcome: string; latencyMs: number }) => void;
  },
  adapterRegistry: Record<string, ProviderAdapterLike> = PROVIDERS,
  poolStore?: PoolStore,
): WebSearchProviderLike {
  const pools = poolStore ?? createPoolStore(resolveKeys);

  return {
    id: PROVIDER_ID,

    /**
     * "Web Search provider service available": the plugin is enabled AND the
     * configured chain contains at least one enabled adapter. This deliberately
     * does NOT check that an API key is configured — keys are resolved lazily
     * per search and a missing key surfaces as an auth failure at call time.
     * UI copy treats this as "service available" (a chain provider exists), not
     * "a credential is ready"; per-key readiness is shown in the settings card.
     */
    available() {
      const cfg = resolveConfig();
      if (!cfg.enabled) return false;
      const chain = fallbackChain({
        defaultProvider: cfg.defaultProvider,
        fallbackOrder: cfg.fallbackOrder,
      });
      return chain.some((name) => {
        if (cfg.enabledProviders[name] === false) return false;
        return adapterRegistry[name] !== undefined;
      });
    },

    async search(request: { query: string; maxResults?: number }, signal?: AbortSignal) {
      const cfg = resolveConfig();
      if (!cfg.enabled) throw new WebToolsWebError("web search is disabled");
      // maxResults is owned by the DSH tool layer (it always passes its own);
      // the plugin does not override it.
      const maxResults = request.maxResults;
      const chain = fallbackChain({
        defaultProvider: cfg.defaultProvider,
        fallbackOrder: cfg.fallbackOrder,
      });

      const attempts: Array<{ provider: string; outcome: string; latencyMs?: number }> = [];
      let lastError: ProviderError | undefined;

      for (const providerName of chain) {
        if (cfg.enabledProviders[providerName] === false) continue;
        const adapter = adapterRegistry[providerName];
        if (!adapter) {
          attempts.push({ provider: providerName, outcome: "skipped-no-adapter" });
          continue;
        }
        const entries = await pools.poolOf(providerName);
        // Keyless self-hosted (SearXNG) stays usable without keys; every other
        // provider needs at least one configured key to attempt a search.
        if (entries.length === 0 && isKeylessSelfHosted(adapter)) {
          // fine — no keys required
        } else if (entries.length === 0) {
          attempts.push({ provider: providerName, outcome: "skipped-no-keys" });
          continue;
        }

        // Auth-invalid keys stay unhealthy until the credential actually
        // changes (refreshPool preserves healthy=false for persisted keys).
        // If the whole pool is unusable, skip this provider — do NOT reset.
        let usable = entries.filter((e) => e.healthy);
        if (usable.length === 0) {
          attempts.push({ provider: providerName, outcome: "skipped-no-healthy-keys" });
          continue;
        }

        // Provider-internal key failover: on AUTH failures only, try the next
        // healthy key in the SAME provider before falling back to another
        // provider. Non-auth failures (429/5xx/network/timeout) do not rotate
        // keys — they fall through to the next provider directly.
        let providerLevelDecision: "next-provider" | "break" | "terminal" | null = null;
        while (usable.length > 0) {
          const index = selectIndex(entries);
          const entry = entries[index];
          if (entry) reserveKey(entries, index);
          const started = Date.now();
          try {
            const outcome = await runWithTimeout(
              (signal) => adapter.search(request.query, maxResults, entry?.key ?? "", cfg.providerBaseUrls[providerName], signal),
              cfg.providerAttemptTimeoutMs,
              signal,
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
            const err = toProviderError(error);
            const latencyMs = Date.now() - started;
            const decision = classifyFailure(err);
            // Caller cancellation terminates the whole chain — never fall back.
            if (decision === "terminal") {
              providerLevelDecision = "terminal";
              lastError = err;
              attempts.push({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
              stats.record({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
              break;
            }
            if (decision === "non-retryable") {
              providerLevelDecision = "break";
              lastError = err;
              attempts.push({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
              stats.record({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
              break;
            }
            // retryable:
            if (err.code === "auth") {
              // key indicted → mark unhealthy, try the next key in this pool
              markUnhealthy(entries, index);
              attempts.push({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
              stats.record({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
              usable = entries.filter((e) => e.healthy);
              continue;
            }
            // non-auth retryable (429/5xx/network/timeout) → next provider
            lastError = err;
            attempts.push({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
            stats.record({ provider: providerName, outcome: `failed:${err.code}`, latencyMs });
            providerLevelDecision = "next-provider";
            break;
          } finally {
            if (entry) releaseKey(entries, index);
          }
        }

        if (providerLevelDecision === "terminal") throw toWebError(lastError);
        if (providerLevelDecision === "break") break;
        // else fall through to the next provider in the chain
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
  adapterRegistry: Record<string, ProviderAdapterLike> = PROVIDERS,
  poolStore?: PoolStore,
): WebFetchProviderLike {
  const pools = poolStore ?? createPoolStore(resolveKeys);

  return {
    id: `${PROVIDER_ID}-fetch`,
    available() {
      const cfg = resolveConfig();
      if (!cfg.enabled) return false;
      const chain = fallbackChain({
        defaultProvider: cfg.defaultProvider,
        fallbackOrder: cfg.fallbackOrder,
      });
      return chain.some((name) => {
        if (cfg.enabledProviders[name] === false) return false;
        const adapter = adapterRegistry[name];
        return adapter !== undefined && adapter.fetchCapable;
      });
    },
    async fetch(request: { url: string }, signal?: AbortSignal) {
      const cfg = resolveConfig();
      const chain = fallbackChain({
        defaultProvider: cfg.defaultProvider,
        fallbackOrder: cfg.fallbackOrder,
      });
      let lastError: ProviderError | undefined;

      for (const providerName of chain) {
        if (cfg.enabledProviders[providerName] === false) continue;
        const adapter = adapterRegistry[providerName];
        if (!adapter || !adapter.fetchCapable) continue; // not a fetch backend, skip
        const entries = await pools.poolOf(providerName);
        if (entries.length === 0) continue; // no credentials for this backend
        const usable = entries.filter((e) => e.healthy);
        if (usable.length === 0) continue; // all keys auth-unhealthy, skip provider
        const index = selectIndex(entries);
        const entry = entries[index];
        try {
          const { text } = await runWithTimeout(
            (sig) => adapter.fetch(request.url, entry?.key ?? "", cfg.providerBaseUrls[providerName], sig),
            cfg.providerAttemptTimeoutMs,
            signal,
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
          const err = toProviderError(error);
          if (err.code === "auth") markUnhealthy(entries, index);
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

/**
 * Run a provider attempt with a real abort: the provider's fetch receives a
 * signal that fires on EITHER the caller's cancellation OR this attempt's
 * timeout, so a timeout genuinely aborts the in-flight HTTP request (no
 * background request lingering / burning quota).
 *
 * Distinguishes the two cases:
 *  - caller abort  → rejects with `aborted` (terminal; the chain stops)
 *  - attempt timeout → rejects with `timeout` (retryable; fallback proceeds)
 *
 * @param run - the provider call; receives the merged abort signal.
 * @param timeoutMs - per-attempt budget; <=0 disables the timer.
 * @param externalSignal - the caller's AbortSignal (optional).
 */
async function runWithTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  // Explicit abort-cause state. A caller abort CLEARS the timer immediately,
  // so a late timer callback can never flip a caller cancellation into a
  // timeout (which would wrongly trigger fallback).
  let abortCause: "caller" | "timeout" | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const onExternalAbort = () => {
    abortCause = "caller";
    clearTimer();
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) throw providerErrorOf("aborted", "search aborted by caller");
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      if (abortCause !== undefined) return; // already aborted by caller
      abortCause = "timeout";
      controller.abort(new Error(`provider timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  try {
    const value = await run(controller.signal);
    if (controller.signal.aborted) {
      throw providerErrorOf(abortCause === "timeout" ? "timeout" : "aborted", controller.signal.reason?.message ?? "attempt aborted");
    }
    return value;
  } catch (error) {
    // If OUR timer fired, the provider's own abort (whatever code it raised)
    // is a TIMEOUT — even if the adapter rethrew its own 'aborted'. External
    // cancellation is only 'aborted' when abortCause is not "timeout".
    if (controller.signal.aborted) {
      throw providerErrorOf(abortCause === "timeout" ? "timeout" : "aborted", controller.signal.reason instanceof Error ? controller.signal.reason.message : String(controller.signal.reason ?? "aborted"));
    }
    throw error;
  } finally {
    clearTimer();
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

/** Build a classified ProviderError with a code + message. */
function providerErrorOf(code: ProviderErrorCode, message: string): ProviderError {
  const err = new Error(message) as ProviderError;
  err.code = code;
  return err;
}
