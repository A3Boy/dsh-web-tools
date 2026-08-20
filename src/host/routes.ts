/**
 * dsh-web-tools — fenced HTTP routes for the settings card.
 *
 * The browser card talks to this Host plugin through its own `/web-tools/api`
 * prefix (following the proven `dsh-better-sidebar` pattern), which:
 *  - applies the same browser-trust fence as the /api gateway
 *  - never exposes credential values (reads return configured/writable state)
 *  - is the config-authority bridge for namespaces the settings RPC whitelist
 *    does not serve
 *
 * @module
 */
import type { WebToolsContext, WebToolsHttpRequest, WebToolsHttpResponse } from "./context-types.ts";
import { poolSummary, type PoolEntry } from "./pool.ts";
import { buildPool, hintOf } from "./pool.ts";
import { credRefOf, getProvider, PROVIDER_LIST } from "./providers/index.ts";
import type { QuotaSnapshot } from "./quota.ts";
import type { ConfigView, ProviderView, SearchMode, SearchModeView } from "../shared/api-types.ts";
import { buildProviderOptionView, sanitizeProviderOptions } from "./provider-options.ts";
import { createHash } from "node:crypto";

/** Opaque per-key id for the remove-key endpoint (sha1 of the key, 8 hex). */
export function keyIdOf(key: string): string {
  return createHash("sha1").update(key).digest("hex").slice(0, 8);
}

/** Route prefix (client fetches `/web-tools/api/<method>`). */
export const API_PREFIX = "/web-tools/api";

/** Dependencies the routes need (injected from the plugin entry). */
export interface RouteDeps {
  readConfig: () => Record<string, unknown>;
  writeConfig: (patch: Record<string, unknown>) => Promise<void>;
  readCredential: (ref: string) => Promise<{ configured: boolean; source?: string; writable: boolean; value?: string }>;
  writeCredential: (ref: string, value: string) => Promise<void>;
  testProviderSearch: (provider: string, query: string) => Promise<Record<string, unknown>>;
  testFullSearch: (query: string) => Promise<Record<string, unknown>>;
  describeQuotas: (force?: boolean) => Promise<Record<string, QuotaSnapshot>>;
  /**
   * Live pool entries for one provider (real key health from the executor),
   * so the card's per-key state matches what search actually uses.
   */
  poolEntries?: (provider: string) => Promise<PoolEntry[]>;
  /** Proxy support status (configured + whether undici is loadable). */
  proxyStatus?: () => Promise<{ configured: boolean; degraded: boolean }>;
  /** Search-Mode runtime access (see search-mode-runtime.ts). */
  searchMode?: {
    view(sessionId: string): SearchModeView;
    set(sessionId: string, mode: SearchMode): SearchModeView;
  };
}

// ---------------------------------------------------------------------------
// response helpers
// ---------------------------------------------------------------------------

function writeJson(res: WebToolsHttpResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function writeOk(res: WebToolsHttpResponse, value: unknown) {
  writeJson(res, 200, { ok: true, value });
}

function writeError(res: WebToolsHttpResponse, status: number, code: string, message: string) {
  writeJson(res, status, { ok: false, error: { code, message } });
}

/** Read a JSON request body (structural async-iterator like better-sidebar). */
async function readJsonBody(req: WebToolsHttpRequest): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    if (raw.length > 1_000_000) throw new Error("payload too large");
  }
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid JSON body");
  }
}

/**
 * Configuration-plane fence: LOOPBACK ONLY + same-origin.
 *
 * Unlike the general /api gateway, these routes mutate settings and
 * credentials — DSH treats that plane as privileged and `trustedHosts` is NOT
 * authentication. A LAN host reaching this DSH instance must NOT be able to
 * read or write provider config/keys.
 *
 * Mirrors the official fence shape: the Host header is parsed as an authority
 * (handles IPv6 `[::1]:port`), and when an Origin header is present its host
 * must match the request Host (DNS-rebinding defense). Sec-Fetch-Site:
 * cross-site is additionally rejected when the browser declares it.
 */

/** Parse the Host header as an authority; returns hostname (lowercased) or "". */
function authorityHost(hostHeader: string | string[] | undefined): string {
  if (typeof hostHeader !== "string") return "";
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLoopbackHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
  // IPv4 loopback range 127.0.0.0/8
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return v4 !== null && Number(v4[1]) === 127;
}

function isLoopback(req: WebToolsHttpRequest): boolean {
  return isLoopbackHost(authorityHost(req.headers?.host));
}

/**
 * Same-origin check: when an Origin header is present, its host must equal
 * the request Host. Absent Origin → allowed (typed navigation / non-browser).
 */
function isSameOrigin(req: WebToolsHttpRequest): boolean {
  const origin = req.headers?.["origin"];
  if (typeof origin !== "string" || origin.length === 0) return true;
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    const requestHost = authorityHost(req.headers?.host);
    return originHost === requestHost;
  } catch {
    return false;
  }
}

/** Reject cross-site browser requests when the browser declares a site. */
function isNotCrossSite(req: WebToolsHttpRequest): boolean {
  const site = req.headers?.["sec-fetch-site"];
  if (typeof site !== "string" || site.length === 0) return true;
  return site !== "cross-site";
}

// ---------------------------------------------------------------------------
// endpoint implementations
// ---------------------------------------------------------------------------

async function handleConfigGet(deps: RouteDeps): Promise<ConfigView> {
  const cfg = deps.readConfig();
  const enabled = cfg.enabled !== false;
  const defaultProvider = (cfg.defaultProvider as string) ?? "tavily";
  const enabledMap = (cfg.providerEnabled as Record<string, boolean>) ?? {};
  const baseUrls = (cfg.providerBaseUrls as Record<string, string>) ?? {};
  const providerOpts = (cfg.providerOptions as Record<string, Record<string, unknown>>) ?? {};

  const providers: ProviderView[] = [];
  for (const meta of PROVIDER_LIST) {
    const ref = credRefOf(meta.name);
    const cred = await deps.readCredential(ref);
    // Prefer the executor's live pool (real key health); fall back to a fresh
    // build when the routes run without one (tests). Never from registry
    // internals: the card shows real configured keys and their current health.
    const pool = deps.poolEntries ? await deps.poolEntries(meta.name) : buildPool(cred.value ?? "");
    providers.push({
      name: meta.name,
      label: meta.label,
      description: meta.description,
      enabled: enabledMap[meta.name] !== false,
      baseUrl: baseUrls[meta.name] ?? meta.defaultBaseUrl,
      baseUrlConfigured: typeof baseUrls[meta.name] === "string" && baseUrls[meta.name].trim().length > 0,
      credRef: ref,
      keyConfigured: cred.configured,
      keyWritable: cred.writable,
      keyHint: pool.length > 0 ? poolSummary(pool)[0].hint : undefined,
      poolSize: pool.length,
      keys: pool.map((e) => ({ id: keyIdOf(e.key), hint: hintOf(e.key), healthy: e.healthy })),
      options: buildProviderOptionView(meta.name, providerOpts[meta.name]),
    });
  }

  return {
    enabled,
    defaultProvider,
    providerAttemptTimeoutMs: (cfg.providerAttemptTimeoutMs as number) ?? 10000,
    fallbackOrder: (cfg.fallbackOrder as string[]) ?? [],
    proxy: deps.proxyStatus ? await deps.proxyStatus() : undefined,
    uiLanguage: (cfg.uiLanguage as "auto" | "zh" | "en") ?? "auto",
    providers,
  };
}

async function handleConfigSave(deps: RouteDeps, payload: unknown) {
  const p = (payload ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof p.enabled === "boolean") patch.enabled = p.enabled;
  if (typeof p.defaultProvider === "string") patch.defaultProvider = p.defaultProvider;
  if (typeof p.providerAttemptTimeoutMs === "number") patch.providerAttemptTimeoutMs = p.providerAttemptTimeoutMs;
  if (Array.isArray(p.fallbackOrder)) patch.fallbackOrder = p.fallbackOrder;
  if (p.providerBaseUrls && typeof p.providerBaseUrls === "object") patch.providerBaseUrls = p.providerBaseUrls;
  if (p.providerEnabled && typeof p.providerEnabled === "object") patch.providerEnabled = p.providerEnabled;
  if (p.uiLanguage === "auto" || p.uiLanguage === "zh" || p.uiLanguage === "en") patch.uiLanguage = p.uiLanguage;
  await deps.writeConfig(patch); // persist BEFORE reporting success
  return { saved: true };
}

async function handleCredentialSet(deps: RouteDeps, payload: unknown) {
  const p = (payload ?? {}) as { provider?: string; value?: string };
  if (!p.provider) throw new Error("missing provider");
  getProvider(p.provider); // validate
  const ref = credRefOf(p.provider);
  await deps.writeCredential(ref, p.value ?? "");
  const entries = buildPool(p.value ?? "");
  return { configured: entries.length > 0, poolSize: entries.length };
}

/** Append ONE key to a provider's pool (storage stays a comma-joined string). */
async function handleCredentialAddKey(deps: RouteDeps, payload: unknown) {
  const p = (payload ?? {}) as { provider?: string; value?: string };
  if (!p.provider) throw new Error("missing provider");
  getProvider(p.provider); // validate
  const value = typeof p.value === "string" ? p.value.trim() : "";
  if (value.length === 0) throw new Error("missing key value");
  const ref = credRefOf(p.provider);
  const cred = await deps.readCredential(ref);
  const entries = buildPool(cred.value ?? "");
  if (entries.some((e) => e.key === value)) throw new Error("key already configured");
  const next = [...entries.map((e) => e.key), value].join(",");
  await deps.writeCredential(ref, next);
  const pool = buildPool(next);
  return { configured: pool.length > 0, poolSize: pool.length };
}

/** Remove ONE key from a provider's pool by its opaque key id. */
async function handleCredentialRemoveKey(deps: RouteDeps, payload: unknown) {
  const p = (payload ?? {}) as { provider?: string; keyId?: string };
  if (!p.provider) throw new Error("missing provider");
  getProvider(p.provider); // validate
  if (typeof p.keyId !== "string" || p.keyId.length === 0) throw new Error("missing key id");
  const ref = credRefOf(p.provider);
  const cred = await deps.readCredential(ref);
  const entries = buildPool(cred.value ?? "");
  const match = entries.find((e) => keyIdOf(e.key) === p.keyId);
  if (match === undefined) throw new Error("key not found");
  const next = entries.filter((e) => e !== match).map((e) => e.key).join(",");
  await deps.writeCredential(ref, next);
  const pool = buildPool(next);
  return { configured: pool.length > 0, poolSize: pool.length };
}

async function handleCredentialDescribe(deps: RouteDeps) {
  const out: Record<string, { configured: boolean; source?: string; writable: boolean }> = {};
  for (const meta of PROVIDER_LIST) {
    const ref = credRefOf(meta.name);
    const cred = await deps.readCredential(ref);
    out[ref] = { configured: cred.configured, source: cred.source, writable: cred.writable };
  }
  return { credentials: out };
}

async function handleTestProvider(deps: RouteDeps, payload: unknown) {
  const p = (payload ?? {}) as { provider?: string; query?: string };
  if (!p.provider) throw new Error("missing provider");
  return deps.testProviderSearch(p.provider, p.query ?? "OpenAI");
}

async function handleTestSearch(deps: RouteDeps, payload: unknown) {
  const p = (payload ?? {}) as { query?: string };
  if (!p.query || !p.query.trim()) throw new Error("missing query");
  return deps.testFullSearch(p.query);
}

async function handleQuotaDescribe(deps: RouteDeps, payload: unknown) {
  const force = (payload as { force?: boolean } | undefined)?.force === true;
  return { quotas: await deps.describeQuotas(force) };
}

async function handleSearchModeGet(deps: RouteDeps, payload: unknown) {
  const sessionId = String((payload as { sessionId?: unknown })?.sessionId ?? "");
  if (!sessionId) throw new Error("missing sessionId");
  if (!deps.searchMode) throw new Error("search-mode runtime unavailable");
  return deps.searchMode.view(sessionId);
}

async function handleSearchModeSet(deps: RouteDeps, payload: unknown) {
  const p = (payload ?? {}) as { sessionId?: unknown; mode?: unknown };
  const sessionId = String(p.sessionId ?? "");
  const mode = p.mode;
  if (!sessionId) throw new Error("missing sessionId");
  if (mode !== "auto" && mode !== "required") throw new Error("invalid mode");
  if (!deps.searchMode) throw new Error("search-mode runtime unavailable");
  return deps.searchMode.set(sessionId, mode);
}

async function handleProviderOptionsSet(deps: RouteDeps, payload: unknown) {
  const p = (payload ?? {}) as { provider?: unknown; options?: unknown };
  const provider = String(p.provider ?? "").trim().toLowerCase();
  if (!provider) throw new Error("missing provider");
  const meta = PROVIDER_LIST.find((m) => m.name === provider);
  if (!meta) throw new Error(`unknown provider: ${provider}`);

  const rawOpts = (p.options && typeof p.options === "object") ? (p.options as Record<string, unknown>) : {};
  const cleaned = sanitizeProviderOptions(provider, rawOpts);

  const cfg = deps.readConfig();
  const currentMerged = { ...((cfg.providerOptions as Record<string, Record<string, unknown>>) ?? {}) };
  currentMerged[provider] = cleaned;

  await deps.writeConfig({ providerOptions: currentMerged });
  return buildProviderOptionView(provider, cleaned);
}

async function handleProviderOptionsReset(deps: RouteDeps, payload: unknown) {
  const p = (payload ?? {}) as { provider?: unknown };
  const provider = String(p.provider ?? "").trim().toLowerCase();
  if (!provider) throw new Error("missing provider");
  const meta = PROVIDER_LIST.find((m) => m.name === provider);
  if (!meta) throw new Error(`unknown provider: ${provider}`);

  const cfg = deps.readConfig();
  const currentMerged = { ...((cfg.providerOptions as Record<string, Record<string, unknown>>) ?? {}) };
  delete currentMerged[provider];

  await deps.writeConfig({ providerOptions: currentMerged });
  return buildProviderOptionView(provider, undefined);
}

// ---------------------------------------------------------------------------
// route registration
// ---------------------------------------------------------------------------

const ENDPOINTS: Record<string, (deps: RouteDeps, payload: unknown) => Promise<unknown>> = {
  "config/get": (deps) => handleConfigGet(deps),
  "config/save": (deps, payload) => handleConfigSave(deps, payload),
  "credentials/set": (deps, payload) => handleCredentialSet(deps, payload),
  "credentials/add-key": (deps, payload) => handleCredentialAddKey(deps, payload),
  "credentials/remove-key": (deps, payload) => handleCredentialRemoveKey(deps, payload),
  "credentials/describe": (deps) => handleCredentialDescribe(deps),
  "test/provider": (deps, payload) => handleTestProvider(deps, payload),
  "test/search": (deps, payload) => handleTestSearch(deps, payload),
  "quota/describe": (deps, payload) => handleQuotaDescribe(deps, payload),
  "search-mode/get": (deps, payload) => handleSearchModeGet(deps, payload),
  "search-mode/set": (deps, payload) => handleSearchModeSet(deps, payload),
  "provider-options/set": (deps, payload) => handleProviderOptionsSet(deps, payload),
  "provider-options/reset": (deps, payload) => handleProviderOptionsReset(deps, payload),
};

/** Register the fenced `/web-tools/api` prefix. Returns the disposer. */
export function registerRoutes(ctx: WebToolsContext, deps: RouteDeps): () => void {
  return ctx.webServer.register({
    kind: "prefix",
    path: API_PREFIX,
    handler: async (req, res) => {
      // Configuration plane: loopback-only + same-origin, never trustedHosts.
      if (!isLoopback(req) || !isSameOrigin(req) || !isNotCrossSite(req)) {
        writeError(res, 403, "forbidden", "forbidden");
        return;
      }
      if (req.method !== "POST") {
        writeError(res, 405, "method-error", "method not allowed");
        return;
      }
      const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
      // Endpoint names carry a slash ("config/get", "test/search"); take the
      // whole remaining path after the prefix as the method key.
      const method = pathname.startsWith(`${API_PREFIX}/`) ? pathname.slice(API_PREFIX.length + 1) : undefined;
      if (method === undefined || method.length === 0) {
        writeError(res, 404, "not-found", "unknown web-tools API method");
        return;
      }
      const handler = ENDPOINTS[method];
      if (handler === undefined) {
        writeError(res, 404, "not-found", `unknown web-tools API method "${method}"`);
        return;
      }
      try {
        const payload = await readJsonBody(req);
        writeOk(res, await handler(deps, payload));
      } catch (e) {
        writeError(res, 500, "internal", e instanceof Error ? e.message : String(e));
      }
    },
  });
}
