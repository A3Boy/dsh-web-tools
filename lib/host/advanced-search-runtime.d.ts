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
import type { PoolStore, WebToolsRuntimeConfig } from "./registry.ts";
import type { ProviderAdapter } from "./providers/types.ts";
import type { AdvancedSearchOutcome, ProviderAdvancedContract } from "./advanced-search-types.ts";
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
export declare class AdvancedSearchRuntime {
    private readonly resolveConfig;
    private readonly resolveKeys;
    private readonly adapters;
    private readonly poolStore;
    /** The provider that the next advanced tool call should target. */
    private activeProvider;
    constructor(resolveConfig: ResolveRuntimeConfig, resolveKeys: ResolveKeys, adapters: AdapterRegistry, poolStore: PoolStore);
    /**
     * Build a structured provider_transition outcome for a stale tool call.
     *
     * Used by tool execution guards when the model invokes a tool whose provider
     * is no longer active.
     */
    buildStaleProviderTransition(staleProvider: string, currentActive: string | undefined): AdvancedSearchOutcome;
    /**
     * Resolve the current active advanced-capable provider. This is the first
     * provider in the fallback chain that (a) is enabled, (b) has an
     * `advanced` contract, and (c) has at least one healthy key (or is keyless).
     *
     * If `activeProvider` was set by a previous transition, verify it is still
     * usable; if not, re-resolve from the chain head.
     */
    resolveActiveProvider(): string | undefined;
    /**
     * Get the active provider's advanced contract, or `undefined` if the active
     * provider has no advanced capability.
     */
    activeContract(): ProviderAdvancedContract<unknown> | undefined;
    /**
     * Execute an advanced search against `providerId`.
     *
     * **Stale-provider guard**: if `providerId` does not match the current active
     * provider, return a `provider_transition` outcome instead of executing.
     * This prevents a model from replaying a previous provider's arguments after
     * the active provider has switched.
     */
    search(providerId: string, input: unknown, signal: AbortSignal): Promise<AdvancedSearchOutcome>;
    /**
     * Classify a failure and decide: repair_required (non-retryable), or
     * provider_transition (retryable). Auth failures mark the key unhealthy and
     * trigger a transition.
     */
    private classifyAndTransition;
}
