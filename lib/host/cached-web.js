/**
 * dsh-web-tools — cache + in-flight coalescing wrapper for the GENERAL search /
 * fetch providers (platform sources such as Xiaohongshu / X are never cached:
 * they depend on a signed-in browser session and their content changes fast).
 *
 * - Only successful, non-empty results are cached.
 * - Identical concurrent calls share one upstream request.
 * - The cache key includes a configuration fingerprint, so any provider / routing
 *   / endpoint change invalidates old entries without explicit bookkeeping.
 * - `runWithoutCache` lets the settings card's manual "test search" measure the
 *   real chain instead of reading a cached answer.
 * @module
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { cachedCall, createCoalescer, createResultCache, fetchCacheKey, searchCacheKey } from "./result-cache.js";
import { WebToolsWebError } from "./registry.js";
export const SEARCH_CACHE_TTL_MS = 60_000;
export const FETCH_CACHE_TTL_MS = 5 * 60_000;
export const SEARCH_CACHE_MAX_ENTRIES = 100;
export const FETCH_CACHE_MAX_ENTRIES = 100;
export const FETCH_CACHE_MAX_BYTES = 4 * 1024 * 1024;
const bypassScope = new AsyncLocalStorage();
/** Run `run` with every cached provider in its call tree skipping reads and writes. */
export function runWithoutCache(run) {
    return bypassScope.run(true, run);
}
function rethrowWebError(error) {
    if (error instanceof Error && "code" in error && error.code === "aborted") {
        const aborted = new WebToolsWebError(error.message);
        aborted.code = "WEB_ABORTED";
        throw aborted;
    }
    throw error;
}
export function createCachedSearchProvider(inner, options) {
    const cache = createResultCache({
        ttlMs: options.ttlMs ?? SEARCH_CACHE_TTL_MS,
        maxEntries: SEARCH_CACHE_MAX_ENTRIES,
        maxBytes: 2 * 1024 * 1024,
        now: options.now,
    });
    const coalescer = createCoalescer();
    let generation = 0;
    return {
        id: inner.id,
        available: () => inner.available(),
        clear: () => { generation += 1; cache.clear(); },
        async search(request, signal) {
            const startedGeneration = generation;
            const key = `${generation}|${searchCacheKey(request.query, request.maxResults, options.fingerprint())}`;
            const { value, cacheHit } = await cachedCall({
                cache,
                coalescer,
                key,
                factory: (s) => inner.search(request, s),
                signal,
                bypass: bypassScope.getStore() === true,
                shouldCache: (result) => generation === startedGeneration && result.sources.length > 0,
            }).catch(rethrowWebError);
            const result = structuredClone(value);
            if (!cacheHit)
                return result;
            const backend = value.backend ?? "cache";
            return {
                ...result,
                backend,
                attempts: [{ provider: backend, outcome: "cache-hit" }],
            };
        },
    };
}
export function createCachedFetchProvider(inner, options) {
    const cache = createResultCache({
        ttlMs: options.ttlMs ?? FETCH_CACHE_TTL_MS,
        maxEntries: FETCH_CACHE_MAX_ENTRIES,
        maxBytes: FETCH_CACHE_MAX_BYTES,
        now: options.now,
    });
    const coalescer = createCoalescer();
    let generation = 0;
    return {
        id: inner.id,
        available: () => inner.available(),
        clear: () => { generation += 1; cache.clear(); },
        async fetch(request, signal) {
            const startedGeneration = generation;
            const key = `${generation}|${fetchCacheKey(request.url, options.fingerprint())}`;
            const { value } = await cachedCall({
                cache,
                coalescer,
                key,
                factory: (s) => inner.fetch(request, s),
                signal,
                bypass: bypassScope.getStore() === true,
                shouldCache: (result) => generation === startedGeneration && result.statusCode >= 200
                    && result.statusCode < 300 && (result.body?.content ?? "").trim().length > 0,
            }).catch(rethrowWebError);
            return { ...structuredClone(value), url: request.url };
        },
    };
}
