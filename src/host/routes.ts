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
import { poolSummary } from "./pool.ts";
import { buildPool } from "./pool.ts";
import { credRefOf, getProvider, PROVIDER_LIST } from "./providers/index.ts";
import type { QuotaSnapshot } from "./quota.ts";

/** Route prefix (client fetches `/web-tools/api/<method>`). */
export const API_PREFIX = "/web-tools/api";

/** Dependencies the routes need (injected from the plugin entry). */
export interface RouteDeps {
  readConfig: () => Record<string, unknown>;
  writeConfig: (patch: Record<string, unknown>) => void;
  readCredential: (ref: string) => Promise<{ configured: boolean; source?: string; writable: boolean; value?: string }>;
  writeCredential: (ref: string, value: string) => Promise<void>;
  testProviderSearch: (provider: string, query: string) => Promise<Record<string, unknown>>;
  testFullSearch: (query: string, provider?: string) => Promise<Record<string, unknown>>;
  describeQuotas: () => Promise<Record<string, QuotaSnapshot>>;
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

/** Browser-trust fence: loopback hosts or the runtime's trusted-host list. */
function isTrusted(req: WebToolsHttpRequest, trustedHosts: readonly string[]): boolean {
  const hostHeader = req.headers?.host;
  const host = typeof hostHeader === "string" ? hostHeader.split(":")[0].toLowerCase() : "";
  if (host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]") return true;
  if (trustedHosts && trustedHosts.some((h) => h.toLowerCase().split(":")[0] === host)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// endpoint implementations
// ---------------------------------------------------------------------------

async function handleConfigGet(deps: RouteDeps) {
  const cfg = deps.readConfig();
  const enabled = cfg.enabled !== false;
  const defaultProvider = (cfg.defaultProvider as string) ?? "tavily";
  const enabledMap = (cfg.providerEnabled as Record<string, boolean>) ?? {};
  const baseUrls = (cfg.providerBaseUrls as Record<string, string>) ?? {};

  const providers = [];
  for (const meta of PROVIDER_LIST) {
    const ref = credRefOf(meta.name);
    const cred = await deps.readCredential(ref);
    // Rebuild the pool from the authoritative credential value (never from
    // registry internals): the card shows real configured keys and sizes.
    const pool = buildPool(cred.value ?? "");
    providers.push({
      name: meta.name,
      label: meta.label,
      description: meta.description,
      enabled: enabledMap[meta.name] !== false,
      baseUrl: baseUrls[meta.name] ?? meta.defaultBaseUrl,
      credRef: ref,
      keyConfigured: cred.configured,
      keyWritable: cred.writable,
      keyHint: pool.length > 0 ? poolSummary(pool)[0].hint : undefined,
      poolSize: pool.length,
      pool: poolSummary(pool),
    });
  }

  return {
    enabled,
    defaultProvider,
    maxResults: (cfg.maxResults as number) ?? 5,
    searchTimeoutMs: (cfg.searchTimeoutMs as number) ?? 10000,
    fallbackOrder: (cfg.fallbackOrder as string[]) ?? [],
    maxFallbackProviders: (cfg.maxFallbackProviders as number) ?? 2,
    providers,
  };
}

function handleConfigSave(deps: RouteDeps, payload: unknown) {
  const p = (payload ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof p.enabled === "boolean") patch.enabled = p.enabled;
  if (typeof p.defaultProvider === "string") patch.defaultProvider = p.defaultProvider;
  if (typeof p.maxResults === "number") patch.maxResults = p.maxResults;
  if (typeof p.searchTimeoutMs === "number") patch.searchTimeoutMs = p.searchTimeoutMs;
  if (Array.isArray(p.fallbackOrder)) patch.fallbackOrder = p.fallbackOrder;
  if (typeof p.maxFallbackProviders === "number") patch.maxFallbackProviders = p.maxFallbackProviders;
  if (p.providerBaseUrls && typeof p.providerBaseUrls === "object") patch.providerBaseUrls = p.providerBaseUrls;
  if (p.providerEnabled && typeof p.providerEnabled === "object") patch.providerEnabled = p.providerEnabled;
  deps.writeConfig(patch);
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
  const p = (payload ?? {}) as { query?: string; provider?: string };
  if (!p.query || !p.query.trim()) throw new Error("missing query");
  return deps.testFullSearch(p.query, p.provider);
}

async function handleQuotaDescribe(deps: RouteDeps) {
  return { quotas: await deps.describeQuotas() };
}

// ---------------------------------------------------------------------------
// route registration
// ---------------------------------------------------------------------------

const ENDPOINTS: Record<string, (deps: RouteDeps, payload: unknown) => Promise<unknown>> = {
  "config/get": (deps) => handleConfigGet(deps),
  "config/save": (deps, payload) => Promise.resolve(handleConfigSave(deps, payload)),
  "credentials/set": (deps, payload) => handleCredentialSet(deps, payload),
  "credentials/describe": (deps) => handleCredentialDescribe(deps),
  "test/provider": (deps, payload) => handleTestProvider(deps, payload),
  "test/search": (deps, payload) => handleTestSearch(deps, payload),
  "quota/describe": (deps) => handleQuotaDescribe(deps),
};

/** Register the fenced `/web-tools/api` prefix. Returns the disposer. */
export function registerRoutes(ctx: WebToolsContext, deps: RouteDeps): () => void {
  return ctx.webServer.register({
    kind: "prefix",
    path: API_PREFIX,
    handler: async (req, res) => {
      if (!isTrusted(req, ctx.webRuntime?.trustedHosts ?? [])) {
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
