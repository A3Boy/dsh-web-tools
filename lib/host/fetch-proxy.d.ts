/** The first usable proxy from the standard env vars, or undefined. */
export declare function proxyFromEnv(): string | undefined;
/**
 * Fetch a URL, honoring `HTTPS_PROXY`/`HTTP_PROXY` when set.
 * Signature matches the global fetch; callers pass the same init.
 */
export declare function fetchWithProxy(url: string | URL, init?: RequestInit): Promise<Response>;
