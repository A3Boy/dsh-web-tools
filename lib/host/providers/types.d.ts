/**
 * dsh-web-tools — provider adapter contract.
 *
 * Each adapter implements search (and optionally fetch) for one backend,
 * normalized to DSH's `WebSearchResult` shape. Adapters own their HTTP
 * calls and SSRF guards; the registry owns pools and fallback.
 * @module
 */
/** Normalized source (mirrors DSH WebSearchSource). */
export interface Source {
    url: string;
    title?: string;
    snippet?: string;
    publishedAt?: string;
}
/** Normalized search outcome (mirrors DSH WebSearchResult). */
export interface SearchOutcome {
    content?: string;
    sources: Source[];
}
/** Machine classification of a provider failure (closed union). */
export type ProviderErrorCode = "auth" | "quota" | "bad-request" | "rate-limit" | "timeout" | "server" | "network" | "config" | "aborted" | "invalid-response";
/** Classified failure raised by adapters (never thrown raw). */
export interface ProviderError extends Error {
    /** Machine code from {@link ProviderErrorCode}. */
    code: ProviderErrorCode;
    /** Original HTTP status when applicable. */
    status?: number;
    /** Server-requested cooldown in ms (from Retry-After header, 429 only). */
    retryAfterMs?: number;
    /** Upstream request ID for diagnostics. */
    requestId?: string;
}
/**
 * Classify an HTTP status uniformly across every adapter. Single source of
 * truth for fallback semantics; adapters must NOT hand-roll their own mapping.
 */
export declare function classifyHttpStatus(status: number): ProviderErrorCode;
/** Adapter metadata (static). */
export interface ProviderMeta {
    /** Stable id used in config/credentials/UI ("tavily"). */
    name: string;
    label: string;
    /** Human description shown in the settings card. */
    description: string;
    /** Credential ref suffix (TAVILY → WEB_TOOLS_TAVILY). */
    credSuffix: string;
    /**
     * Whether this provider exposes a native/provider-side page extraction API.
     *
     * false does NOT mean web_fetch is unavailable:
     * dsh-web-tools automatically falls back to its built-in generic HTTP fetcher (Defuddle).
     */
    fetchCapable: boolean;
    /** Needs a base URL (self-hosted like SearXNG) vs hosted. */
    needsBaseUrl: boolean;
    /** Default base URL when self-hosted. */
    defaultBaseUrl?: string;
}
import type { SearchHints } from "../search-hints.ts";
/**
 * Per-execution context passed to provider search / fetch adapters.
 * Encapsulates the cancellation signal, user-configured options,
 * and high-confidence semantic search hints extracted from the query.
 */
export interface ProviderExecutionContext<TOptions = unknown> {
    readonly signal?: AbortSignal;
    readonly options?: Readonly<TOptions>;
    readonly hints?: Readonly<SearchHints>;
}
/** One configured adapter instance. */
export interface ProviderAdapter extends ProviderMeta {
    /**
     * Run one search through this backend.
     * @param query
     * @param maxResults
     * @param apiKey
     * @param baseUrl
     * @param contextOrSignal optional execution context with typed options and signal, or bare signal
     */
    search(query: string, maxResults: number, apiKey: string, baseUrl: string | undefined, contextOrSignal?: AbortSignal | ProviderExecutionContext): Promise<SearchOutcome>;
    /**
     * Fetch one URL's text content through this backend (when fetchCapable).
     * @throws ProviderError when unsupported.
     */
    fetch(url: string, apiKey: string, baseUrl: string | undefined, contextOrSignal?: AbortSignal | ProviderExecutionContext): Promise<{
        text: string;
    }>;
}
/** Helper to extract signal, typed options, and hints from an execution context or bare signal. */
export declare function resolveContext<T = unknown>(contextOrSignal?: AbortSignal | ProviderExecutionContext<T>): {
    signal?: AbortSignal;
    options?: Readonly<T>;
    hints?: Readonly<SearchHints>;
};
export declare const extractContext: typeof resolveContext;
/**
 * Self-hosted provider that needs a base URL and has no Fetch API — and
 * therefore works WITHOUT an API key (currently only SearXNG). Keyed-hosted
 * providers always require a key.
 */
export declare function isKeylessSelfHosted(meta: Pick<ProviderMeta, "needsBaseUrl" | "fetchCapable">): boolean;
/** Build a ProviderError with a classification code and optional retry-after metadata. */
export declare function providerError(code: ProviderErrorCode, message: string, status?: number, retryAfterMs?: number): ProviderError;
/**
 * Parse the `Retry-After` response header into milliseconds from now.
 * Supports:
 *  - `Retry-After: 30` (delta-seconds)
 *  - `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT` (HTTP-date)
 * Returns undefined when the header is absent or unparseable.
 */
export declare function parseRetryAfter(res: Response, now?: number): number | undefined;
/**
 * Throw a classified ProviderError from a non-OK HTTP response, with a
 * provider label for the message. Every adapter uses this — no per-adapter
 * status mapping. Retry-After header is parsed and attached to rate-limit errors.
 */
export declare function throwIfHttp(label: string, res: Response): void;
