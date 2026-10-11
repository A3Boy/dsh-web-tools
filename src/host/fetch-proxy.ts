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
 * `undici` is loaded LAZILY: it is a declared dependency, but a profile that
 * was linked before the dependency was declared (or a broken install) may not
 * provide it. A static top-level import would then crash the entire plugin
 * tree at load time. Lazy loading + a plain-fetch fallback keeps the plugin
 * usable (without proxy support) instead of failing to start.
 *
 * The proxy agent is created lazily once per proxy URL and reused.
 * @module
 */
import { execFileSync } from "node:child_process";
import {
  assertEndpointUrl,
  createPinnedDispatcher,
  defaultConnect,
  findAuthorization,
  OUTBOUND_AUTHORIZATIONS,
  preflightDns,
  TransportError,
  type OutboundPolicy,
} from "./provider-transport.ts";
import { PROVIDER_ENDPOINTS } from "./endpoints.ts";

/**
 * Whether `urlStr` is one of THIS provider's official default endpoints.
 *
 * Trust is derived from the requesting provider's identity, never from a global
 * URL set: a Tavily override that happens to equal SearXNG's default address
 * (`http://127.0.0.1:8080/search`) must NOT be trusted, and Jina's dynamic
 * path requests (`https://s.jina.ai/<query>`) MUST be. Each endpoint is matched
 * on scheme + hostname + port, plus:
 *  - an exact path match, or
 *  - any path under the endpoint when the endpoint declares `dynamicPath`
 *    (Jina only), so the query-in-path form stays official without opening up
 *    "any path on the domain is exempt" for other providers.
 */
export function isOfficialForProvider(providerName: string, urlStr: string): boolean {
  const table = PROVIDER_ENDPOINTS[providerName];
  if (!table) return false;
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return false;
  }
  const endpoints = [table.search, ...Object.values(table.extra ?? {})];
  for (const endpoint of endpoints) {
    let official: URL;
    try {
      official = new URL(endpoint.url);
    } catch {
      continue;
    }
    if (u.protocol !== official.protocol) continue;
    if (u.hostname.toLowerCase() !== official.hostname.toLowerCase()) continue;
    // URL.port normalizes default ports to "", so this compares effective ports.
    if (u.port !== official.port) continue;
    if (endpoint.dynamicPath) {
      const base = official.pathname === "/" ? "/" : official.pathname.replace(/\/+$/, "");
      if (base === "/") return true;
      if (u.pathname === official.pathname || u.pathname.startsWith(`${base}/`)) return true;
    } else if (u.pathname === official.pathname) {
      return true;
    }
  }
  return false;
}

/** Whether a request init carries a credential header. */
function hasAuthHeader(init: RequestInit): boolean {
  const raw = init.headers;
  if (!raw) return false;
  if (typeof (raw as Headers).get === "function") {
    const h = raw as Headers;
    return !!(h.get("authorization") || h.get("x-api-key") || h.get("x-subscription-token"));
  }
  const h = raw as Record<string, string>;
  return Object.keys(h).some((k) => {
    const lower = k.toLowerCase();
    return lower === "authorization" || lower === "x-api-key" || lower === "x-subscription-token";
  });
}

/** Optional per-call behavior for fetchWithProxy. */
export interface FetchWithProxyOptions {
  /**
   * Strict provider-API mode, scoped to ONE provider identity. Passed by the
   * hosted built-in adapters so ANY operator override runs the outbound
   * policy: per-provider endpoint trust, DNS preflight, socket pinning,
   * plaintext-http authorization, and fail-closed proxying. Trust is decided by
   * THIS provider's own endpoint table — another provider's default URL is
   * never trusted. Self-hosted providers (SearXNG) deliberately keep the
   * operator-trusted legacy path: their configured URL IS the instance.
   */
  provider?: string;
}

/** Structural ProxyAgent type (we never import undici statically). */
type ProxyAgentLike = new (proxy: string) => unknown;

/** Lazy per-proxy agents (a proxy URL change across calls re-creates). */
const agentCache = new Map<string, unknown>();

/** Cached undici ProxyAgent ctor; null = unavailable, undefined = not tried. */
let proxyAgentCtor: ProxyAgentLike | null | undefined;

/** Lazily resolve undici's ProxyAgent. Never throws — null on failure. */
async function getProxyAgentCtor(): Promise<ProxyAgentLike | null> {
  if (proxyAgentCtor !== undefined) return proxyAgentCtor;
  try {
    const undici = (await import("undici")) as { ProxyAgent?: unknown };
    proxyAgentCtor = typeof undici.ProxyAgent === "function" ? (undici.ProxyAgent as ProxyAgentLike) : null;
  } catch {
    proxyAgentCtor = null;
  }
  return proxyAgentCtor;
}

/**
 * Proxy support status for the settings card:
 *  - configured: a proxy is present (env var or Windows system proxy)
 *  - degraded:   a proxy is configured but undici cannot be loaded, so calls
 *                fall back to direct fetch (no tunneling)
 * Never throws (undici absence is a reportable state, not a crash).
 */
export async function proxyStatus(): Promise<{ configured: boolean; degraded: boolean }> {
  const configured = proxyFromEnv() !== undefined || proxyFromSystem() !== undefined;
  if (!configured) return { configured: false, degraded: false };
  const ctor = await getProxyAgentCtor();
  return { configured: true, degraded: ctor === null };
}

/** The first usable proxy from the standard env vars, or undefined. */
export function proxyFromEnv(): string | undefined {
  for (const name of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) {
    const v = process.env[name];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/** Cached Windows system-proxy probe (registry read is slow-ish; TTL 30s). */
let systemProxyCache: { at: number; value?: string } | undefined;
const SYSTEM_PROXY_TTL_MS = 30_000;

/**
 * Windows system proxy from the registry (HKCU Internet Settings), used when
 * no env var is set. Node never reads the OS proxy, so GUI-launched DSH
 * processes (Clash etc. write only the registry, not env vars) would
 * otherwise try to reach provider APIs directly and fail.
 * @returns proxy URL ("http://host:port") or undefined when not configured.
 */
export function proxyFromSystem(): string | undefined {
  if (process.platform !== "win32") return undefined;
  const now = Date.now();
  if (systemProxyCache && now - systemProxyCache.at < SYSTEM_PROXY_TTL_MS) return systemProxyCache.value;
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
  let value: string | undefined;
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
  } catch {
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
export function shouldBypassProxy(url: string | URL): boolean {
  let host: string;
  let isIpv4Loopback = false;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    isIpv4Loopback = u.protocol === "http:" || u.protocol === "https:"
      ? /^127\.\d+\.\d+\.\d+$/.test(host) || host === "::1" || host === "[::1]" || host === "0:0:0:0:0:0:0:1"
      : false;
  } catch {
    return true;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local") || isIpv4Loopback) return true;
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
  if (typeof noProxy !== "string" || noProxy.trim() === "") return false;
  return noProxy
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
    .some((entry) => {
      if (entry === "<local>") return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
      if (entry.startsWith(".")) return host === entry.slice(1) || host.endsWith(entry);
      return host === entry || host.endsWith(`.${entry}`);
    });
}

/**
 * Wrap a response so the per-request pinned dispatcher outlives the BODY.
 *
 * The wrapper is PULL-driven (a `pull()` loop that reads from the upstream body
 * only when the downstream consumer asks for data), so:
 *  - backpressure is preserved — undici's underlying reader is not drained into
 *    an unbounded buffer ahead of the consumer;
 *  - cancellation propagates — `cancel()` cancels the upstream reader so the
 *    request actually terminates, instead of silently stopping dispatch;
 *  - on any terminal path (done / error / cancel) the dispatcher is destroyed.
 */
function withBodyLifetime(response: Response, onDone: () => void): Response {
  const body = response.body;
  if (!body) {
    onDone();
    return response;
  }
  let finished = false;
  const finish = () => {
    if (!finished) {
      finished = true;
      onDone();
    }
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined = body.getReader();
  let settled = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (settled || !reader) return;
      try {
        const { done, value } = await reader.read();
        if (done) {
          settled = true;
          controller.close();
          finish();
          try { reader.releaseLock(); } catch {}
          reader = undefined;
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        settled = true;
        finish();
        if (reader) {
          try { reader.cancel().catch(() => {}); } catch {}
          try { reader.releaseLock(); } catch {}
        }
        reader = undefined;
        controller.error(err);
      }
    },
    cancel() {
      settled = true;
      finish();
      if (reader) {
        try { reader.cancel().catch(() => {}); } catch {}
        try { reader.releaseLock(); } catch {}
        reader = undefined;
      }
    },
  });
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function destroySafely(dispatcher: unknown): Promise<void> {
  if (dispatcher && typeof (dispatcher as { destroy?: unknown }).destroy === "function") {
    try {
      await (dispatcher as { destroy: () => Promise<unknown> }).destroy();
    } catch {
      // destroy failures are best-effort
    }
  }
}

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
export async function fetchWithProxy(
  url: string | URL,
  init?: RequestInit,
  options?: FetchWithProxyOptions,
): Promise<Response> {
  const urlStr = typeof url === "string" ? url : url.href;
  const parsed = assertEndpointUrl(urlStr);
  const providerName = options?.provider;
  const providerMode = providerName !== undefined && providerName !== "";
  const isOfficial = providerMode && isOfficialForProvider(providerName as string, urlStr);

  // A request carrying credentials must NEVER follow redirects, so a 3xx can
  // never leak the credential to another host.
  const modifiedInit: RequestInit & { dispatcher?: unknown } = { ...(init ?? {}) };
  if (hasAuthHeader(modifiedInit) && modifiedInit.redirect === undefined) {
    modifiedInit.redirect = "error";
  }

  // ---- provider mode + overridden destination: strict outbound policy ------
  if (providerMode && !isOfficial) {
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
    const hostname = parsed.hostname.toLowerCase();
    const policy: OutboundPolicy = { authorizations: OUTBOUND_AUTHORIZATIONS };
    const authorization = findAuthorization(hostname, port, policy);

    // Plaintext http carrying an API key requires an explicit allowHttp grant.
    if (parsed.protocol === "http:" && authorization?.allowHttp !== true) {
      throw new TransportError(
        "destination-blocked",
        `Provider endpoint "${hostname}:${port}" is not authorized for plaintext http access`,
      );
    }

    const preflight = await preflightDns(hostname, authorization ? "authorized" : "public", policy, {
      lookupAll: async (h) => {
        const dns = await import("node:dns/promises");
        const res = await dns.lookup(h, { all: true });
        return res as Array<{ address: string; family: number }>;
      },
    });

    const proxyUrl = shouldBypassProxy(url) ? undefined : (proxyFromEnv() ?? proxyFromSystem());
    if (proxyUrl !== undefined) {
      // Through a proxy the final DNS/connection happens at the proxy, so a
      // local preflight cannot substantiate the destination. Fail closed unless
      // this exact target is authorized for proxied egress.
      if (authorization?.allowProxy !== true) {
        throw new TransportError(
          "proxy-required",
          `Provider endpoint "${hostname}:${port}" is not authorized for proxied egress; add an outbound authorization with allowProxy`,
        );
      }
      const Ctor = await getProxyAgentCtor();
      if (Ctor === null) {
        throw new TransportError("network", "undici ProxyAgent unavailable for authorized proxied egress");
      }
      let agent = agentCache.get(proxyUrl);
      if (!agent) {
        agent = new Ctor(proxyUrl);
        agentCache.set(proxyUrl, agent);
      }
      const { dispatcher: _ignored, ...rest } = modifiedInit;
      void _ignored;
      return await fetch(url, { ...rest, dispatcher: agent } as unknown as RequestInit);
    }

    // Direct path: pin the socket to the preflighted IP, keep the dispatcher
    // alive until the response body is fully consumed.
    const pinnedDispatcher = await createPinnedDispatcher({
      address: preflight.addresses[0].address,
      port,
      servername: parsed.hostname,
      useTls: parsed.protocol === "https:",
      connectTimeoutMs: 10_000,
      connect: defaultConnect,
      signal: (modifiedInit.signal as AbortSignal) ?? new AbortController().signal,
    });
    modifiedInit.dispatcher = pinnedDispatcher;
    try {
      const response = await fetch(url, modifiedInit as unknown as RequestInit);
      return withBodyLifetime(response, () => void destroySafely(pinnedDispatcher));
    } catch (err) {
      await destroySafely(pinnedDispatcher);
      throw err;
    }
  }

  // ---- official default endpoints and legacy/page mode: existing behavior --
  if (shouldBypassProxy(url)) return await fetch(url, modifiedInit as unknown as RequestInit);
  const proxy = proxyFromEnv() ?? proxyFromSystem();
  if (proxy === undefined) return await fetch(url, modifiedInit as unknown as RequestInit);
  const Ctor = await getProxyAgentCtor();
  if (Ctor === null) return await fetch(url, modifiedInit as unknown as RequestInit); // undici missing → plain fetch
  let agent = agentCache.get(proxy);
  if (!agent) {
    agent = new Ctor(proxy);
    agentCache.set(proxy, agent);
  }
  const { dispatcher, ...rest } = modifiedInit;
  void dispatcher; // ignore any caller-supplied dispatcher (we own the proxy)
  return await fetch(url, { ...rest, dispatcher: agent } as unknown as RequestInit);
}
