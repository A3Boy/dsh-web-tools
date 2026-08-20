/**
 * dsh-web-tools — Advanced search runtime.
 *
 * Owns the provider-native advanced search path. Unlike basic `web_search`
 * (which goes through `ctx.web.search()` with runtime-mediated fallback),
 * advanced search is **agent-mediated**: a retryable failure produces a
 * `provider_transition` outcome, the active provider switches, and the next
 * inference exposes the new provider's tool. The model must re-construct the
 * request against the new provider's schema.
 *
 * The runtime never translates provider A's parameters into provider B's.
 * Basic `web_search({query})` is untouched.
 * @module
 */

import { fallbackChain } from "./fallback.ts";
import { selectIndex, markUsed, markUnhealthy, type PoolEntry } from "./pool.ts";
import type { PoolStore, WebToolsRuntimeConfig } from "./registry.ts";
import type { ProviderAdapter } from "./providers/types.ts";
import type {
  AdvancedSearchOutcome,
  AdvancedSearchResult,
  AdvancedProviderFailure,
  AdvancedProviderFailureCode,
  AdvancedSearchExecutionContext,
  ProviderAdvancedContract,
  ProviderCapabilityState,
} from "./advanced-search-types.ts";

/** Adapter registry (injectable for tests; production uses the global PROVIDERS map). */
export type AdapterRegistry = Record<string, ProviderAdapter>;

/** Resolve config for each advanced search operation. */
export type ResolveRuntimeConfig = () => WebToolsRuntimeConfig;

/** Resolve the raw credential string for one provider (comma-joined multi-key). */
export type ResolveKeys = (providerName: string) => Promise<string>;

/**
 * The advanced search runtime. One instance per plugin; holds a mutable
 * `activeProvider` that changes on `provider_transition`.
 */
export class AdvancedSearchRuntime {
  /** The provider that the next advanced tool call should target. */
  private activeProvider: string | undefined;

  constructor(
    private readonly resolveConfig: ResolveRuntimeConfig,
    private readonly resolveKeys: ResolveKeys,
    private readonly adapters: AdapterRegistry,
    private readonly poolStore: PoolStore,
  ) {}

  /**
   * Build a structured provider_transition outcome for a stale tool call.
   *
   * Used by tool execution guards when the model invokes a tool whose provider
   * is no longer active.
   */
  buildStaleProviderTransition(staleProvider: string, currentActive: string | undefined): AdvancedSearchOutcome {
    const nextTool = currentActive
      ? (this.adapters[currentActive]?.advanced?.toolName ?? "web_search")
      : "web_search";
    return {
      kind: "provider_transition",
      provider: staleProvider,
      transition: {
        from: staleProvider,
        to: currentActive ?? "none",
        nextTool,
        reason: `Provider '${staleProvider}' is no longer active. Current active provider is '${currentActive ?? "none"}'.`,
      },
    };
  }

  /**
   * Resolve the current active advanced-capable provider. This is the first
   * provider in the fallback chain that (a) is enabled, (b) has an
   * `advanced` contract, and (c) has at least one healthy key (or is keyless).
   *
   * If `activeProvider` was set by a previous transition, verify it is still
   * usable; if not, re-resolve from the chain head.
   */
  resolveActiveProvider(): string | undefined {
    const cfg = this.resolveConfig();
    const chain = fallbackChain({
      defaultProvider: cfg.defaultProvider,
      fallbackOrder: cfg.fallbackOrder,
    });

    for (const name of chain) {
      if (cfg.enabledProviders[name] === false) continue;
      const adapter = this.adapters[name];
      if (!adapter?.advanced) continue;
      // Key availability is checked lazily at search time; resolveActiveProvider
      // only checks adapter presence + enabled + advanced contract.
      return name;
    }
    return undefined;
  }

  /**
   * Get the active provider's advanced contract, or `undefined` if the active
   * provider has no advanced capability.
   */
  activeContract(): ProviderAdvancedContract<unknown> | undefined {
    const active = this.resolveActiveProvider();
    if (active === undefined) return undefined;
    return this.adapters[active]?.advanced;
  }

  /**
   * Execute an advanced search against `providerId`.
   *
   * **Stale-provider guard**: if `providerId` does not match the current active
   * provider, return a `provider_transition` outcome instead of executing.
   * This prevents a model from replaying a previous provider's arguments after
   * the active provider has switched.
   */
  async search(
    providerId: string,
    input: unknown,
    signal: AbortSignal,
  ): Promise<AdvancedSearchOutcome> {
    const cfg = this.resolveConfig();
    if (!cfg.enabled) {
      return {
        kind: "configuration_error",
        provider: providerId,
        failure: { code: "UNSUPPORTED_CAPABILITY", message: "web search is disabled" },
      };
    }

    const active = this.resolveActiveProvider();

    // Stale-provider guard: the model called a tool for a provider that is no
    // longer active. Do NOT execute — return a transition so the model knows to
    // use the current provider's tool instead.
    if (active === undefined) {
      return {
        kind: "provider_exhausted",
        attempts: [{ provider: providerId, outcome: "no-advanced-provider-available" }],
      };
    }
    if (providerId !== active) {
      const activeAdapter = this.adapters[active];
      const nextTool = activeAdapter?.advanced?.toolName ?? `web_search_${active}`;
      return {
        kind: "provider_transition",
        provider: providerId,
        transition: {
          from: providerId,
          to: active,
          nextTool,
          reason: `active provider is ${active}, not ${providerId}`,
        },
      };
    }

    const adapter = this.adapters[active];
    const contract = adapter?.advanced;
    if (contract === undefined) {
      // resolveActiveProvider should have filtered this, but guard anyway.
      return {
        kind: "configuration_error",
        provider: active,
        failure: { code: "UNSUPPORTED_CAPABILITY", message: `${active} has no advanced contract` },
      };
    }

    // --- Preflight validation (deterministic, no network) ---
    const capabilities: ProviderCapabilityState = { disabled: new Set(), revision: 1 };
    const validation = contract.validate(input, capabilities);
    if (!validation.ok || validation.request === undefined) {
      const failure: AdvancedProviderFailure = {
        code: "REQUEST_INVALID",
        message: "request failed preflight validation",
        ...(validation.fieldErrors === undefined ? {} : { fieldErrors: validation.fieldErrors }),
      };
      return { kind: "repair_required", provider: active, failure };
    }

    // --- Resolve key + pool ---
    const entries = await this.poolStore.poolOf(active);
    if (entries.length === 0) {
      return {
        kind: "configuration_error",
        provider: active,
        failure: { code: "AUTH", message: `${active} has no API key configured` },
      };
    }
    const usable = entries.filter((e) => e.healthy);
    if (usable.length === 0) {
      return {
        kind: "configuration_error",
        provider: active,
        failure: { code: "AUTH", message: `${active} has no healthy keys` },
      };
    }

    const index = selectIndex(entries);
    const entry = entries[index];
    const apiKey = entry?.key ?? "";

    // --- Execute with timeout + abort ---
    const context: AdvancedSearchExecutionContext = {
      apiKey,
      baseUrl: cfg.providerBaseUrls[active],
      attemptTimeoutMs: cfg.providerAttemptTimeoutMs,
      signal,
    };

    let result: AdvancedSearchResult;
    try {
      result = await runWithTimeout(
        (sig) => contract.search(validation.request as never, { ...context, signal: sig }),
        cfg.providerAttemptTimeoutMs,
        signal,
      );
    } catch (error: unknown) {
      const failure = contract.classifyError(error);
      return this.classifyAndTransition(active, entries, index, failure, cfg);
    }

    if (result.ok === true) {
      if (entry) markUsed(entries, index);
      return {
        kind: "success",
        provider: active,
        sources: result.sources,
        truncated: result.truncated,
      };
    } else {
      // Provider returned a classified failure (ok: false).
      const failure: AdvancedProviderFailure = (result as { ok: false; failure: AdvancedProviderFailure }).failure;
      return this.classifyAndTransition(active, entries, index, failure, cfg);
    }
  }

  /**
   * Classify a failure and decide: repair_required (non-retryable), or
   * provider_transition (retryable). Auth failures mark the key unhealthy and
   * trigger a transition.
   */
  private classifyAndTransition(
    provider: string,
    entries: PoolEntry[],
    index: number,
    failure: AdvancedProviderFailure,
    cfg: WebToolsRuntimeConfig,
  ): AdvancedSearchOutcome {
    // Terminal (aborted) — never transition.
    if (failure.code === "ABORTED") {
      return { kind: "repair_required", provider, failure };
    }

    // Non-retryable (request invalid, option conflict) — model must fix args.
    if (failure.code === "REQUEST_INVALID" || failure.code === "OPTION_CONFLICT" || failure.code === "UNSUPPORTED_CAPABILITY") {
      return { kind: "repair_required", provider, failure };
    }

    // Configuration errors (auth missing, no healthy keys) — not retryable
    // by switching providers; the configuration itself is wrong.
    if (failure.code === "AUTH" && failure.message.includes("no API key")) {
      return { kind: "configuration_error", provider, failure };
    }

    // Retryable: AUTH (bad key), RATE_LIMIT, QUOTA, TIMEOUT, UPSTREAM, NETWORK.
    // Mark the key unhealthy on AUTH, then find the next advanced-capable provider.
    if (failure.code === "AUTH") {
      markUnhealthy(entries, index);
    }

    // Find next advanced-capable provider in the chain.
    const chain = fallbackChain({
      defaultProvider: cfg.defaultProvider,
      fallbackOrder: cfg.fallbackOrder,
    });
    const currentIndex = chain.indexOf(provider);
    let nextProvider: string | undefined;
    for (let i = currentIndex + 1; i < chain.length; i++) {
      const name = chain[i];
      if (name === undefined) continue;
      if (cfg.enabledProviders[name] === false) continue;
      const adapter = this.adapters[name];
      if (adapter?.advanced) {
        nextProvider = name;
        break;
      }
    }

    if (nextProvider === undefined) {
      return {
        kind: "provider_exhausted",
        attempts: [{ provider, outcome: `failed:${failure.code}` }],
      };
    }

    const nextAdapter = this.adapters[nextProvider];
    const nextTool = nextAdapter?.advanced?.toolName ?? `web_search_${nextProvider}`;
    this.activeProvider = nextProvider;

    return {
      kind: "provider_transition",
      provider,
      transition: {
        from: provider,
        to: nextProvider,
        nextTool,
        reason: `${provider} failed with ${failure.code}`,
      },
    };
  }
}

/**
 * Run a provider attempt with a real abort: the provider's search receives a
 * signal that fires on EITHER the caller's cancellation OR this attempt's
 * timeout. Mirrors the basic path's `runWithTimeout` in registry.ts.
 */
async function runWithTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
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
    controller.abort(externalSignal.reason);
  };

  if (externalSignal.aborted) {
    throw new AdvancedSearchAbortError("search aborted by caller");
  }
  externalSignal.addEventListener("abort", onExternalAbort, { once: true });

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      if (abortCause !== undefined) return;
      abortCause = "timeout";
      controller.abort(new Error(`provider timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  try {
    const value = await run(controller.signal);
    if (controller.signal.aborted) {
      throw abortCause === "timeout"
        ? new AdvancedSearchTimeoutError(`provider timed out after ${timeoutMs}ms`)
        : new AdvancedSearchAbortError("search aborted by caller");
    }
    return value;
  } catch (error) {
    if (controller.signal.aborted) {
      throw abortCause === "timeout"
        ? new AdvancedSearchTimeoutError(`provider timed out after ${timeoutMs}ms`)
        : new AdvancedSearchAbortError("search aborted by caller");
    }
    throw error;
  } finally {
    clearTimer();
    externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

/** Internal sentinel for caller cancellation (classified as ABORTED). */
class AdvancedSearchAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvancedSearchAbortError";
  }
}

/** Internal sentinel for attempt timeout (classified as TIMEOUT). */
class AdvancedSearchTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvancedSearchTimeoutError";
  }
}
