/**
 * dsh-web-tools — network fetch helper.
 *
 * Node's global fetch (undici) does NOT honor `HTTPS_PROXY` / `HTTP_PROXY`
 * environment variables, unlike .NET/curl. On networks where provider APIs
 * require a proxy (e.g. api.search.brave.com behind a Clash gateway), every
 * provider call would hang and time out. This helper detects the standard
 * proxy env vars and routes requests through undici's ProxyAgent when set,
 * falling back to the native fetch otherwise.
 *
 * The proxy agent is created lazily once per proxy URL and reused.
 * @module
 */
import { ProxyAgent } from "undici";
/** Lazy per-proxy agents (a proxy URL change across calls re-creates). */
const agentCache = new Map();
/** The first usable proxy from the standard env vars, or undefined. */
export function proxyFromEnv() {
    for (const name of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) {
        const v = process.env[name];
        if (typeof v === "string" && v.trim().length > 0)
            return v.trim();
    }
    return undefined;
}
/**
 * Fetch a URL, honoring `HTTPS_PROXY`/`HTTP_PROXY` when set.
 * Signature matches the global fetch; callers pass the same init.
 */
export async function fetchWithProxy(url, init) {
    const proxy = proxyFromEnv();
    if (proxy === undefined)
        return fetch(url, init);
    let agent = agentCache.get(proxy);
    if (!agent) {
        agent = new ProxyAgent(proxy);
        agentCache.set(proxy, agent);
    }
    const { dispatcher, ...rest } = (init ?? {});
    void dispatcher; // ignore any caller-supplied dispatcher (we own the proxy)
    // undici's dispatcher is not part of the standard RequestInit type; cast
    // through a structural type so ProxyAgent is accepted at runtime.
    return fetch(url, { ...rest, dispatcher: agent });
}
