import { fetchWithProxy } from "./fetch-proxy.ts";
import { type DnsLookupFn } from "./fetch-security.ts";
/** Maximum response body bytes allowed (5 MiB). */
export declare const MAX_FETCH_BYTES: number;
/** Maximum redirect hops before aborting. */
export declare const MAX_REDIRECT_HOPS = 5;
/** Default per-attempt timeout for generic fetch (10 seconds). */
export declare const DEFAULT_GENERIC_FETCH_TIMEOUT_MS = 10000;
/** Classified error codes for generic web fetch operations. */
export type GenericFetchErrorCode = "WEB_INVALID_URL" | "WEB_FETCH_BLOCKED" | "WEB_NETWORK" | "WEB_TIMEOUT" | "WEB_HTTP_ERROR" | "WEB_CONTENT_TOO_LARGE" | "WEB_UNSUPPORTED_CONTENT_TYPE" | "WEB_PARSE_ERROR" | "WEB_EMPTY_CONTENT" | "WEB_ABORTED";
export declare class GenericFetchError extends Error {
    readonly code: GenericFetchErrorCode;
    readonly statusCode?: number;
    readonly url?: string;
    constructor(code: GenericFetchErrorCode, message: string, details?: {
        statusCode?: number;
        url?: string;
    });
}
export interface GenericFetchResult {
    url: string;
    finalUrl: string;
    statusCode: number;
    contentType: string;
    title?: string;
    author?: string;
    publishedAt?: string;
    description?: string;
    content: string;
    truncated: boolean;
    backend: "builtin-http";
    extraction: "defuddle" | "raw-text";
}
export interface GenericFetchOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
    customFetchWithProxy?: typeof fetchWithProxy;
    customDnsLookup?: DnsLookupFn;
}
/**
 * Fetch a web page using built-in HTTP client with proxy support, redirect security, DNS SSRF guard, and local-only Defuddle parsing.
 */
export declare function fetchGenericWebPage(initialUrl: string, optionsOrSignal?: AbortSignal | GenericFetchOptions, legacyCustomFetch?: typeof fetchWithProxy): Promise<GenericFetchResult>;
