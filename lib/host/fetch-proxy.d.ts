/** Optional per-call behavior for fetchWithProxy. */
export interface FetchWithProxyOptions {
    /**
     * Strict provider-API mode. Passed by the hosted built-in adapters so ANY
     * operator override runs the outbound policy: exact-endpoint trust, DNS
     * preflight, socket pinning, plaintext-http authorization, and fail-closed
     * proxying. Self-hosted providers (SearXNG) deliberately keep the
     * operator-trusted legacy path — their configured URL IS the instance.
     */
    provider?: boolean;
}
/**
 * Proxy support status for the settings card:
 *  - configured: a proxy is present (env var or Windows system proxy)
 *  - degraded:   a proxy is configured but undici cannot be loaded, so calls
 *                fall back to direct fetch (no tunneling)
 * Never throws (undici absence is a reportable state, not a crash).
 */
export declare function proxyStatus(): Promise<{
    configured: boolean;
    degraded: boolean;
}>;
/** The first usable proxy from the standard env vars, or undefined. */
export declare function proxyFromEnv(): string | undefined;
/**
 * Windows system proxy from the registry (HKCU Internet Settings), used when
 * no env var is set. Node never reads the OS proxy, so GUI-launched DSH
 * processes (Clash etc. write only the registry, not env vars) would
 * otherwise try to reach provider APIs directly and fail.
 * @returns proxy URL ("http://host:port") or undefined when not configured.
 */
export declare function proxyFromSystem(): string | undefined;
/**
 * Whether a request should bypass the proxy. Loopback targets (localhost,
 * 127.0.0.1, ::1, *.local) NEVER go through a proxy — a local SearXNG
 * instance or the DSH web server itself must not be tunneled to the internet
 * proxy. Additionally honors `NO_PROXY` / `no_proxy` for exact hosts,
 * `.suffix` domains, and `<local>`.
 */
export declare function shouldBypassProxy(url: string | URL): boolean;
/**
 * Fetch a URL, honoring proxies (env vars, then Windows system proxy) unless
 * `NO_PROXY` matches.
 *
 * Two modes:
 *  - legacy/page mode (default): unchanged proxy behavior. Used by web_fetch
 *    (generic-fetch preflights upstream) and the release checker.
 *  - `options.provider` mode: strict outbound policy for hosted built-in
 *    providers. ANY operator override runs the full gate — exact-endpoint
 *    trust, DNS preflight + socket pinning, plaintext-http authorization, and
 *    fail-closed proxying (a proxy's own DNS cannot be substantiated locally).
 *    The pinned dispatcher is kept alive until the response BODY has been
 *    consumed (adapters read it after fetch() resolves on the headers), so
 *    undici's destroy() can never terminate a mid-read body.
 */
export declare function fetchWithProxy(url: string | URL, init?: RequestInit, options?: FetchWithProxyOptions): Promise<Response>;
