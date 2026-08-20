import { type PoolEntry } from "./pool.ts";
import type { StoredProviderOptions } from "../shared/provider-options.ts";
import type { ProviderHealthStore } from "./provider-health.ts";
/** Stable provider id registered on ctx.web (the `web` row's searchProvider). */
export declare const PROVIDER_ID = "dsh-web-tools";
/** Structural mirror of the seam's WebSearchProvider contract. */
export interface WebSearchProviderLike {
    id: string;
    available(): boolean;
    search(request: {
        query: string;
        maxResults?: number;
    }, signal?: AbortSignal): Promise<{
        content?: string;
        sources: Array<{
            url: string;
            title?: string;
            snippet?: string;
            publishedAt?: string;
        }>;
        truncated: boolean;
    }>;
}
/** Structural mirror of the seam's WebFetchProvider contract. */
export interface WebFetchProviderLike {
    id: string;
    available(): boolean;
    fetch(request: {
        url: string;
    }, signal?: AbortSignal): Promise<{
        url: string;
        statusCode: number;
        body: {
            kind: "html" | "text";
            content: string;
        };
        truncated: boolean;
    }>;
}
/** A classified failure the executor throws (WebError-compatible shape). */
export declare class WebToolsWebError extends Error {
    code: string;
    attempts?: Array<{
        provider: string;
        outcome: string;
        latencyMs?: number;
    }>;
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
    providerOptions?: StoredProviderOptions;
}
/** Live per-provider key pools, keyed by provider name. */
export type Pools = Record<string, PoolEntry[]>;
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
export declare function createPoolStore(resolveKeys: (providerName: string) => Promise<string>): {
    poolOf: (providerName: string) => Promise<PoolEntry[]>;
};
export type PoolStore = ReturnType<typeof createPoolStore>;
/** Structural subset of a provider adapter the executor needs (injectable). */
export interface ProviderAdapterLike {
    name: string;
    needsBaseUrl: boolean;
    fetchCapable: boolean;
    search(query: string, maxResults: number | undefined, apiKey: string, baseUrl: string | undefined, contextOrSignal?: AbortSignal | {
        signal?: AbortSignal;
        options?: unknown;
    }): Promise<{
        sources: Array<{
            url: string;
            title?: string;
            snippet?: string;
            publishedAt?: string;
        }>;
    }>;
    fetch(url: string, apiKey: string, baseUrl: string | undefined, contextOrSignal?: AbortSignal | {
        signal?: AbortSignal;
        options?: unknown;
    }): Promise<{
        text: string;
    }>;
}
/** Build a WebToolsSearchProvider for `ctx.web.registerSearchProvider`.
 *  `adapterRegistry` is injectable for tests; production uses the global
 *  PROVIDERS map (passed by index.ts via the default). */
export declare function createSearchProvider(resolveConfig: () => WebToolsRuntimeConfig, resolveKeys: (providerName: string) => Promise<string>, stats: {
    record: (entry: {
        provider: string;
        outcome: string;
        latencyMs: number;
    }) => void;
}, adapterRegistry?: Record<string, ProviderAdapterLike>, poolStore?: PoolStore, healthStore?: ProviderHealthStore): WebSearchProviderLike;
/**
 * Build a `WebFetchProvider` for `ctx.web.registerFetchProvider`. V1 routes
 * fetch through the default provider's native extract endpoint; providers
 * without native fetch fail with a classified error.
 */
export declare function createFetchProvider(resolveConfig: () => WebToolsRuntimeConfig, resolveKeys: (providerName: string) => Promise<string>, adapterRegistry?: Record<string, ProviderAdapterLike>, poolStore?: PoolStore, healthStore?: ProviderHealthStore): WebFetchProviderLike;
