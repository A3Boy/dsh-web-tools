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
    /** Whether the backend supports native fetch (正文抽取). */
    fetchCapable: boolean;
    /** Needs a base URL (self-hosted like SearXNG) vs hosted. */
    needsBaseUrl: boolean;
    /** Default base URL when self-hosted. */
    defaultBaseUrl?: string;
}
/** One configured adapter instance. */
export interface ProviderAdapter extends ProviderMeta {
    /**
     * Run one search through this backend.
     * @param query
     * @param maxResults
     * @param apiKeyPool the pool entries for this provider (may be empty for keyless self-hosted).
     * @param baseUrl
     * @param signal
     */
    search(query: string, maxResults: number, apiKey: string, baseUrl: string | undefined, signal?: AbortSignal): Promise<SearchOutcome>;
    /**
     * Fetch one URL's text content through this backend (when fetchCapable).
     * @throws ProviderError when unsupported.
     */
    fetch(url: string, apiKey: string, baseUrl: string | undefined, signal?: AbortSignal): Promise<{
        text: string;
    }>;
}
/**
 * Self-hosted provider that needs a base URL and has no Fetch API — and
 * therefore works WITHOUT an API key (currently only SearXNG). Keyed-hosted
 * providers always require a key.
 */
export declare function isKeylessSelfHosted(meta: Pick<ProviderMeta, "needsBaseUrl" | "fetchCapable">): boolean;
/** Build a ProviderError with a classification code. */
export declare function providerError(code: ProviderErrorCode, message: string, status?: number): ProviderError;
/**
 * Throw a classified ProviderError from a non-OK HTTP response, with a
 * provider label for the message. Every adapter uses this — no per-adapter
 * status mapping.
 */
export declare function throwIfHttp(label: string, res: Response): void;
