import { fetchWithProxy } from "./fetch-proxy.ts";
/** Maximum response body bytes allowed (5 MiB). */
export declare const MAX_FETCH_BYTES: number;
/** Maximum redirect hops before aborting. */
export declare const MAX_REDIRECT_HOPS = 5;
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
/**
 * Fetch a web page using built-in HTTP client with proxy support, redirect security, and Defuddle parsing.
 */
export declare function fetchGenericWebPage(initialUrl: string, signal?: AbortSignal, customFetchWithProxy?: typeof fetchWithProxy): Promise<GenericFetchResult>;
