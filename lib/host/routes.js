import { poolSummary } from "./pool.js";
import { buildPool, hintOf } from "./pool.js";
import { credRefOf, getProvider, PROVIDER_LIST } from "./providers/index.js";
import { createHash } from "node:crypto";
/** Opaque per-key id for the remove-key endpoint (sha1 of the key, 8 hex). */
export function keyIdOf(key) {
    return createHash("sha1").update(key).digest("hex").slice(0, 8);
}
/** Route prefix (client fetches `/web-tools/api/<method>`). */
export const API_PREFIX = "/web-tools/api";
// ---------------------------------------------------------------------------
// response helpers
// ---------------------------------------------------------------------------
function writeJson(res, status, body) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
}
function writeOk(res, value) {
    writeJson(res, 200, { ok: true, value });
}
function writeError(res, status, code, message) {
    writeJson(res, status, { ok: false, error: { code, message } });
}
/** Read a JSON request body (structural async-iterator like better-sidebar). */
async function readJsonBody(req) {
    let raw = "";
    for await (const chunk of req) {
        raw += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        if (raw.length > 1_000_000)
            throw new Error("payload too large");
    }
    if (raw.trim() === "")
        return {};
    try {
        return JSON.parse(raw);
    }
    catch {
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
function authorityHost(hostHeader) {
    if (typeof hostHeader !== "string")
        return "";
    try {
        return new URL(`http://${hostHeader}`).hostname.toLowerCase();
    }
    catch {
        return "";
    }
}
function isLoopbackHost(host) {
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]")
        return true;
    // IPv4 loopback range 127.0.0.0/8
    const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    return v4 !== null && Number(v4[1]) === 127;
}
function isLoopback(req) {
    return isLoopbackHost(authorityHost(req.headers?.host));
}
/**
 * Same-origin check: when an Origin header is present, its host must equal
 * the request Host. Absent Origin → allowed (typed navigation / non-browser).
 */
function isSameOrigin(req) {
    const origin = req.headers?.["origin"];
    if (typeof origin !== "string" || origin.length === 0)
        return true;
    try {
        const originHost = new URL(origin).hostname.toLowerCase();
        const requestHost = authorityHost(req.headers?.host);
        return originHost === requestHost;
    }
    catch {
        return false;
    }
}
/** Reject cross-site browser requests when the browser declares a site. */
function isNotCrossSite(req) {
    const site = req.headers?.["sec-fetch-site"];
    if (typeof site !== "string" || site.length === 0)
        return true;
    return site !== "cross-site";
}
// ---------------------------------------------------------------------------
// endpoint implementations
// ---------------------------------------------------------------------------
async function handleConfigGet(deps) {
    const cfg = deps.readConfig();
    const enabled = cfg.enabled !== false;
    const defaultProvider = cfg.defaultProvider ?? "tavily";
    const enabledMap = cfg.providerEnabled ?? {};
    const baseUrls = cfg.providerBaseUrls ?? {};
    const providers = [];
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
        });
    }
    return {
        enabled,
        defaultProvider,
        providerAttemptTimeoutMs: cfg.providerAttemptTimeoutMs ?? 10000,
        fallbackOrder: cfg.fallbackOrder ?? [],
        providers,
    };
}
async function handleConfigSave(deps, payload) {
    const p = (payload ?? {});
    const patch = {};
    if (typeof p.enabled === "boolean")
        patch.enabled = p.enabled;
    if (typeof p.defaultProvider === "string")
        patch.defaultProvider = p.defaultProvider;
    if (typeof p.providerAttemptTimeoutMs === "number")
        patch.providerAttemptTimeoutMs = p.providerAttemptTimeoutMs;
    if (Array.isArray(p.fallbackOrder))
        patch.fallbackOrder = p.fallbackOrder;
    if (p.providerBaseUrls && typeof p.providerBaseUrls === "object")
        patch.providerBaseUrls = p.providerBaseUrls;
    if (p.providerEnabled && typeof p.providerEnabled === "object")
        patch.providerEnabled = p.providerEnabled;
    await deps.writeConfig(patch); // persist BEFORE reporting success
    return { saved: true };
}
async function handleCredentialSet(deps, payload) {
    const p = (payload ?? {});
    if (!p.provider)
        throw new Error("missing provider");
    getProvider(p.provider); // validate
    const ref = credRefOf(p.provider);
    await deps.writeCredential(ref, p.value ?? "");
    const entries = buildPool(p.value ?? "");
    return { configured: entries.length > 0, poolSize: entries.length };
}
/** Append ONE key to a provider's pool (storage stays a comma-joined string). */
async function handleCredentialAddKey(deps, payload) {
    const p = (payload ?? {});
    if (!p.provider)
        throw new Error("missing provider");
    getProvider(p.provider); // validate
    const value = typeof p.value === "string" ? p.value.trim() : "";
    if (value.length === 0)
        throw new Error("missing key value");
    const ref = credRefOf(p.provider);
    const cred = await deps.readCredential(ref);
    const entries = buildPool(cred.value ?? "");
    if (entries.some((e) => e.key === value))
        throw new Error("key already configured");
    const next = [...entries.map((e) => e.key), value].join(",");
    await deps.writeCredential(ref, next);
    const pool = buildPool(next);
    return { configured: pool.length > 0, poolSize: pool.length };
}
/** Remove ONE key from a provider's pool by its opaque key id. */
async function handleCredentialRemoveKey(deps, payload) {
    const p = (payload ?? {});
    if (!p.provider)
        throw new Error("missing provider");
    getProvider(p.provider); // validate
    if (typeof p.keyId !== "string" || p.keyId.length === 0)
        throw new Error("missing key id");
    const ref = credRefOf(p.provider);
    const cred = await deps.readCredential(ref);
    const entries = buildPool(cred.value ?? "");
    const match = entries.find((e) => keyIdOf(e.key) === p.keyId);
    if (match === undefined)
        throw new Error("key not found");
    const next = entries.filter((e) => e !== match).map((e) => e.key).join(",");
    await deps.writeCredential(ref, next);
    const pool = buildPool(next);
    return { configured: pool.length > 0, poolSize: pool.length };
}
async function handleCredentialDescribe(deps) {
    const out = {};
    for (const meta of PROVIDER_LIST) {
        const ref = credRefOf(meta.name);
        const cred = await deps.readCredential(ref);
        out[ref] = { configured: cred.configured, source: cred.source, writable: cred.writable };
    }
    return { credentials: out };
}
async function handleTestProvider(deps, payload) {
    const p = (payload ?? {});
    if (!p.provider)
        throw new Error("missing provider");
    return deps.testProviderSearch(p.provider, p.query ?? "OpenAI");
}
async function handleTestSearch(deps, payload) {
    const p = (payload ?? {});
    if (!p.query || !p.query.trim())
        throw new Error("missing query");
    return deps.testFullSearch(p.query);
}
async function handleQuotaDescribe(deps, payload) {
    const force = payload?.force === true;
    return { quotas: await deps.describeQuotas(force) };
}
// ---------------------------------------------------------------------------
// route registration
// ---------------------------------------------------------------------------
const ENDPOINTS = {
    "config/get": (deps) => handleConfigGet(deps),
    "config/save": (deps, payload) => handleConfigSave(deps, payload),
    "credentials/set": (deps, payload) => handleCredentialSet(deps, payload),
    "credentials/add-key": (deps, payload) => handleCredentialAddKey(deps, payload),
    "credentials/remove-key": (deps, payload) => handleCredentialRemoveKey(deps, payload),
    "credentials/describe": (deps) => handleCredentialDescribe(deps),
    "test/provider": (deps, payload) => handleTestProvider(deps, payload),
    "test/search": (deps, payload) => handleTestSearch(deps, payload),
    "quota/describe": (deps, payload) => handleQuotaDescribe(deps, payload),
};
/** Register the fenced `/web-tools/api` prefix. Returns the disposer. */
export function registerRoutes(ctx, deps) {
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
            }
            catch (e) {
                writeError(res, 500, "internal", e instanceof Error ? e.message : String(e));
            }
        },
    });
}
