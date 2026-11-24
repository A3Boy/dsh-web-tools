export interface ResultCacheOptions {
    /** Entry lifetime in ms (absolute from insertion; reads do not extend it). */
    ttlMs: number;
    maxEntries: number;
    /** Total size budget in `sizeOf` units; a single larger value is never cached. */
    maxBytes?: number;
    now?: () => number;
    sizeOf?: (value: unknown) => number;
}
export interface ResultCache<T> {
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    delete(key: string): void;
    clear(): void;
    readonly size: number;
    readonly bytes: number;
}
export declare function defaultSizeOf(value: unknown): number;
/** TTL + LRU cache bounded by entry count and total size. */
export declare function createResultCache<T>(options: ResultCacheOptions): ResultCache<T>;
/** Trim and collapse whitespace so trivially different queries share an entry. */
export declare function normalizeQuery(query: string): string;
/** Order-independent short hash of the configuration that shapes results. */
export declare function fingerprint(value: unknown): string;
export declare function searchCacheKey(query: string, maxResults: number | undefined, configFingerprint: string): string;
/** Fragments never reach the server, so they must not split cache entries. */
export declare function fetchCacheKey(url: string, configFingerprint: string): string;
export interface Coalescer<T> {
    run(key: string, factory: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
    readonly size: number;
}
/**
 * Share one in-flight call per key. The factory's signal fires only when all
 * waiters have aborted; an aborted waiter itself rejects with code `aborted`.
 */
export declare function createCoalescer<T>(): Coalescer<T>;
export interface CachedCallArgs<T> {
    cache: ResultCache<T>;
    coalescer: Coalescer<T>;
    key: string;
    factory: (signal: AbortSignal) => Promise<T>;
    signal?: AbortSignal;
    /** Skip reads and writes (manual "test search"); never joins a cached call. */
    bypass?: boolean;
    /** Return false to keep a successful-but-useless result (e.g. empty) out of the cache. */
    shouldCache?: (value: T) => boolean;
}
/** Serve from cache, else run once (shared among identical callers) and cache successes. */
export declare function cachedCall<T>(args: CachedCallArgs<T>): Promise<{
    value: T;
    cacheHit: boolean;
}>;
