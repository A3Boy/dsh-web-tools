import { type WebFetchProviderLike, type WebSearchProviderLike } from "./registry.ts";
export declare const SEARCH_CACHE_TTL_MS = 60000;
export declare const FETCH_CACHE_TTL_MS: number;
export declare const SEARCH_CACHE_MAX_ENTRIES = 100;
export declare const FETCH_CACHE_MAX_ENTRIES = 100;
export declare const FETCH_CACHE_MAX_BYTES: number;
/** Run `run` with every cached provider in its call tree skipping reads and writes. */
export declare function runWithoutCache<T>(run: () => Promise<T>): Promise<T>;
export interface CacheWrapOptions {
    /** Fingerprint of every setting that shapes results; evaluated per call. */
    fingerprint: () => string;
    ttlMs?: number;
    now?: () => number;
}
export interface Clearable {
    clear(): void;
}
export declare function createCachedSearchProvider(inner: WebSearchProviderLike, options: CacheWrapOptions): WebSearchProviderLike & Clearable;
export declare function createCachedFetchProvider(inner: WebFetchProviderLike, options: CacheWrapOptions): WebFetchProviderLike & Clearable;
