/**
 * dsh-web-tools — Built-in provider endpoint table + override resolution.
 *
 * ## Why joins are explicit
 *
 * `new URL("/search", "https://gw.example.com/v2")` yields
 * `https://gw.example.com/search` — the `/v2` prefix is silently DROPPED,
 * because a root-relative reference replaces the whole path. Gateway deploys
 * (and Firecrawl's own `/v2` base) then 404. {@link joinUrl} strips leading
 * slashes from the relative part and appends, so a configured prefix survives.
 *
 * ## Three-state override
 *
 * | state          | stored              | effective        |
 * |----------------|---------------------|------------------|
 * | untouched      | nothing             | official default |
 * | overridden     | only the override   | the override     |
 * | reset          | override deleted    | official default |
 *
 * @module
 */
/** One endpoint of one provider. */
export interface ProviderEndpoint {
    /** Absolute official URL, including any version prefix. */
    url: string;
    /** Host the official credential is safe to send to. */
    host: string;
    /**
     * Whether the base-URL override applies to this endpoint. Only the SEARCH
     * endpoint is overridable by default: a gateway that proxies search may not
     * proxy extract/scrape/balance, and silently sending a credential to a
     * different host for those is a credential-leak vector.
     */
    overridable: boolean;
}
/** Official endpoints per built-in provider. */
export declare const PROVIDER_ENDPOINTS: Record<string, {
    search: ProviderEndpoint;
    extra?: Record<string, ProviderEndpoint>;
}>;
/**
 * Providers whose default endpoint is intentionally loopback (self-hosted).
 * The outbound policy treats an *unmodified* default as operator-trusted —
 * a locally installed SearXNG is the normal case — while an operator-typed
 * private address still needs explicit authorization.
 */
export declare const SELF_HOSTED_PROVIDERS: Set<string>;
/** Resolved view of one endpoint: default, override and the effective URL. */
export interface EndpointView {
    defaultBaseUrl: string;
    baseUrlOverride: string | null;
    effectiveBaseUrl: string;
    isOverridden: boolean;
    /** Full URL of the requested endpoint (prefix-preserving). */
    url: string;
}
/**
 * Join a base URL with a relative path, preserving any base path prefix.
 *
 * @param baseUrl absolute base, with or without a path prefix.
 * @param relative path such as `/search` or `search`.
 * @throws {Error} when either side is empty or the relative part is absolute.
 */
export declare function joinUrl(baseUrl: string, relative: string): string;
/** Remove trailing slashes (but never the whole string). */
export declare function stripTrailingSlash(value: string): string;
/**
 * The origin (scheme://host[:port]) of a base URL. Used for the outbound
 * policy's host comparison so a path prefix never weakens the check.
 */
export declare function originOf(baseUrl: string): string;
/**
 * The base URL a provider should use, from the persisted override map.
 *
 * An empty or whitespace-only override means "not overridden" — that is how
 * the UI's "restore default" action clears the entry.
 */
export declare function resolveBaseUrl(providerName: string, overrides: Record<string, string> | undefined, endpointKey?: string): string | undefined;
/** The base URL portion of a full endpoint URL (for override defaults). */
export declare function baseUrlOf(endpointUrl: string): string;
/**
 * Full endpoint resolution for one provider.
 *
 * Accepts the persisted override map (the shape settings stores) and extracts
 * this provider's entry, so callers inside an adapter — which receive only
 * their own `baseUrl` — can build a one-entry map without a cast.
 *
 * @param providerName built-in id, e.g. `"tavily"`.
 * @param overrides persisted `providerBaseUrls`.
 * @param endpointKey which endpoint to resolve (default `"search"`).
 */
export declare function endpointViewOf(providerName: string, overrides: Record<string, string | undefined> | undefined, endpointKey?: string): EndpointView | undefined;
/**
 * Whether an override target is the same origin as the official endpoint.
 * When it is not, the operator is about to send an existing credential to a
 * different service and must confirm.
 */
export declare function isForeignOverride(providerName: string, overrideBaseUrl: string, endpointKey?: string): boolean;
