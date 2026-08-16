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
 * `NO_PROXY` matches. Signature matches the global fetch; callers pass the
 * same init.
 */
export declare function fetchWithProxy(url: string | URL, init?: RequestInit): Promise<Response>;
