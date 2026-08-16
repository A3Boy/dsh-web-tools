/**
 * dsh-web-tools — network fetch helper.
 *
 * Node's global fetch (undici) does NOT honor `HTTPS_PROXY` / `HTTP_PROXY`
 * environment variables, unlike .NET/curl. On networks where provider APIs
 * require a proxy (e.g. api.search.brave.com behind a Clash gateway), every
 * provider call would hang and time out. This helper detects the standard
 * proxy env vars and routes requests through undici's ProxyAgent when set.
 *
 * Proxy resolution order (first match wins):
 *   1. `HTTPS_PROXY` / `https_proxy` / `HTTP_PROXY` / `http_proxy` env vars
 *   2. the Windows system proxy (registry) — for GUI-launched DSH processes
 *      that inherit no env vars but have a system proxy configured
 * `NO_PROXY` / `no_proxy` entries bypass the proxy for matching hosts
 * (e.g. `localhost`, internal instances).
 *
 * The proxy agent is created lazily once per proxy URL and reused.
 * @module
 */
import { execFileSync } from "node:child_process";
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
/** Cached Windows system-proxy probe (registry read is slow-ish; TTL 30s). */
let systemProxyCache;
const SYSTEM_PROXY_TTL_MS = 30_000;
/**
 * Windows system proxy from the registry (HKCU Internet Settings), used when
 * no env var is set. Node never reads the OS proxy, so GUI-launched DSH
 * processes (Clash etc. write only the registry, not env vars) would
 * otherwise try to reach provider APIs directly and fail.
 * @returns proxy URL ("http://host:port") or undefined when not configured.
 */
export function proxyFromSystem() {
    if (process.platform !== "win32")
        return undefined;
    const now = Date.now();
    if (systemProxyCache && now - systemProxyCache.at < SYSTEM_PROXY_TTL_MS)
        return systemProxyCache.value;
    const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    let value;
    try {
        const enabled = execFileSync("reg", ["query", key, "/v", "ProxyEnable"], { encoding: "utf8", windowsHide: true, timeout: 2000 });
        if (!/0x1\b/.test(enabled)) {
            systemProxyCache = { at: now };
            return undefined;
        }
        const server = execFileSync("reg", ["query", key, "/v", "ProxyServer"], { encoding: "utf8", windowsHide: true, timeout: 2000 });
        const m = /ProxyServer\s+REG_SZ\s+(\S+)/.exec(server);
        if (m) {
            // The registry value may be a bare "host:port" or a per-protocol list
            // like "http=host:8080;https=host:8080" — normalize to a URL.
            const raw = m[1].split(";").find((p) => /^https?=/i.test(p))?.split("=")[1] ?? m[1];
            value = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
        }
    }
    catch {
        // registry unreadable (non-Windows tooling, restricted env) → no system proxy
    }
    systemProxyCache = { at: now, value };
    return value;
}
/**
 * Whether a request should bypass the proxy. Loopback targets (localhost,
 * 127.0.0.1, ::1, *.local) NEVER go through a proxy — a local SearXNG
 * instance or the DSH web server itself must not be tunneled to the internet
 * proxy. Additionally honors `NO_PROXY` / `no_proxy` for exact hosts,
 * `.suffix` domains, and `<local>`.
 */
export function shouldBypassProxy(url) {
    let host;
    let isIpv4Loopback = false;
    try {
        const u = new URL(url);
        host = u.hostname.toLowerCase();
        isIpv4Loopback = u.protocol === "http:" || u.protocol === "https:"
            ? /^127\.\d+\.\d+\.\d+$/.test(host) || host === "::1" || host === "[::1]" || host === "0:0:0:0:0:0:0:1"
            : false;
    }
    catch {
        return true;
    }
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local") || isIpv4Loopback)
        return true;
    const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
    if (typeof noProxy !== "string" || noProxy.trim() === "")
        return false;
    return noProxy
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
        .some((entry) => {
        if (entry === "<local>")
            return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
        if (entry.startsWith("."))
            return host === entry.slice(1) || host.endsWith(entry);
        return host === entry || host.endsWith(`.${entry}`);
    });
}
/**
 * Fetch a URL, honoring proxies (env vars, then Windows system proxy) unless
 * `NO_PROXY` matches. Signature matches the global fetch; callers pass the
 * same init.
 */
export async function fetchWithProxy(url, init) {
    if (shouldBypassProxy(url))
        return fetch(url, init);
    const proxy = proxyFromEnv() ?? proxyFromSystem();
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
