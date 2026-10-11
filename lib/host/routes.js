import { poolSummary } from "./pool.js";
import { buildPool, hintOf } from "./pool.js";
import { credRefOf, getProvider, PROVIDER_LIST } from "./providers/index.js";
import { buildProviderOptionView, sanitizeProviderOptions } from "./provider-options.js";
import { createHash } from "node:crypto";
import { endpointViewOf, isForeignOverride, PROVIDER_ENDPOINTS } from "./endpoints.js";
import { CustomProviderValidationError, credentialRefsOf, generateSourceId, loadCustomProviders, validateDraft, validateSourceId, } from "./custom-provider-schema.js";
import { MAX_CUSTOM_PROVIDERS, } from "../shared/custom-provider-types.js";
import { sanitizeBaseUrlOverrides } from "./config.js";
async function handlePlatformStatus(deps) {
    let statuses = await deps.sourceRegistry.getPlatformStatuses();
    // A persisted dedicated profile means the user has completed login before,
    // but cold-start metadata is not authentication proof. Verify it in the
    // background runtime before returning status so the UI never asks the user
    // to manually validate an existing session.
    const needsVerification = statuses.filter((status) => status.sessionEstablished && !status.authenticated);
    if (needsVerification.length > 0) {
        const results = await Promise.allSettled(needsVerification.map(async (status) => {
            const isAuth = await deps.nativeRuntime.verifyAuthenticationForOperation(status.id, undefined, status.id === "xiaohongshu" ? "interactive" : "headless");
            return { id: status.id, isAuth };
        }));
        // Reload statuses after verification
        statuses = await deps.sourceRegistry.getPlatformStatuses();
        // For any platform that was verified true in this flight, ensure status reflects authenticated
        for (const res of results) {
            if (res.status === "fulfilled" && res.value.isAuth) {
                const target = statuses.find((s) => s.id === res.value.id);
                if (target) {
                    target.authenticated = true;
                }
            }
        }
    }
    const platforms = {};
    for (const s of statuses) {
        platforms[s.id] = {
            id: s.id,
            name: s.name,
            enabled: s.enabled,
            runtimeAvailable: s.runtimeAvailable,
            runtimeState: s.runtimeState,
            authenticated: s.authenticated,
            sessionEstablished: s.sessionEstablished,
            capabilities: s.capabilities,
            account: s.account,
            lastError: s.lastError,
            lastCheckedAt: s.lastCheckedAt,
        };
    }
    return { platforms };
}
async function handlePlatformLogin(deps, payload) {
    const platform = payload?.platform;
    if (platform === "xiaohongshu" || platform === "x") {
        // Run login flow asynchronously, client polls status
        deps.nativeRuntime.login(platform).catch(() => { });
        return { status: "login-pending" };
    }
    return { status: "unknown_platform" };
}
async function handlePlatformStop(deps, payload) {
    const platform = payload?.platform;
    if (platform === "xiaohongshu" || platform === "x") {
        await deps.nativeRuntime.stop(platform);
        return { ok: true };
    }
    return { ok: false };
}
async function handlePlatformReset(deps, payload) {
    const platform = payload?.platform;
    if (platform === "xiaohongshu" || platform === "x") {
        await deps.nativeRuntime.resetSession(platform);
        return { ok: true };
    }
    return { ok: false };
}
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
 * Configuration-plane fence: LOOPBACK PEER ONLY + same-origin.
 *
 * Unlike the general /api gateway, these routes mutate settings and
 * credentials — DSH treats that plane as privileged and `trustedHosts` is NOT
 * authentication. A LAN host reaching this DSH instance must NOT be able to
 * read or write provider config/keys.
 *
 * ## Why the Host header alone is not enough
 *
 * The Host header is caller-controlled: on a deployment bound to 0.0.0.0 any
 * LAN client can send `Host: 127.0.0.1` and satisfy a Host-only loopback test,
 * then read or overwrite stored API keys. The same is true for the Origin and
 * Sec-Fetch-Site checks — they are browser-asserted, so a non-browser client
 * simply omits them.
 *
 * The real defense is the TCP peer. DSH's webserver passes the raw Node
 * request to route handlers, so `req.socket.remoteAddress` is the actual
 * connection peer and cannot be forged. It is the PRIMARY check here; the
 * Host/Origin checks remain as defense in depth against DNS rebinding of a
 * genuine local browser.
 *
 * Note deliberately NOT trusted: `X-Forwarded-For`. A reverse proxy terminates
 * the TCP connection, so a spoofable header must never decide authorization.
 * The correct fix for a proxied deployment is the gateway's own authentication,
 * not a header this plugin cannot verify.
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
/** Every loopback spelling Node may report for a loopback peer. */
function isLoopbackAddress(address) {
    const a = address.toLowerCase();
    if (a === "::1" || a === "0:0:0:0:0:0:0:1")
        return true;
    if (a === "::ffff:127.0.0.1" || a.startsWith("::ffff:7f"))
        return true;
    const v4 = a.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    return v4 !== null && Number(v4[1]) === 127;
}
/**
 * The real connection peer address.
 *
 * Returns `undefined` when the runtime does not expose a socket (an in-process
 * test double). Callers must treat `undefined` as "cannot verify" and fall back
 * to the Host check rather than assuming loopback.
 */
export function peerAddressOf(req) {
    const socket = req.socket;
    const address = socket?.remoteAddress;
    return typeof address === "string" && address.length > 0 ? address : undefined;
}
/**
 * Whether this request may touch the configuration plane.
 *
 * @returns `"peer"` when the TCP peer is loopback (strongest), `"host"` when no
 *          peer address is exposed and the Host header is loopback (weaker,
 *          kept so in-process harnesses and tests still work), or `false`.
 */
export function configPlaneTrust(req) {
    if (!isSameOrigin(req) || !isNotCrossSite(req))
        return false;
    const peer = peerAddressOf(req);
    if (peer !== undefined)
        return isLoopbackAddress(peer) ? "peer" : false;
    return isLoopbackHost(authorityHost(req.headers?.host)) ? "host" : false;
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
    const providerOpts = cfg.providerOptions ?? {};
    const platformEnabled = cfg.platformEnabled ?? { xiaohongshu: true, x: true };
    const customProviders = readCustomProviders(deps);
    const credentialsSnapshots = await Promise.all(PROVIDER_LIST.map(async (meta) => {
        const ref = credRefOf(meta.name);
        const cred = await deps.readCredential(ref);
        return { meta, ref, cred };
    }));
    const providers = [];
    for (const { meta, ref, cred } of credentialsSnapshots) {
        const pool = deps.poolEntries ? await deps.poolEntries(meta.name) : buildPool(cred.value ?? "");
        // Built-ins now expose a real three-state endpoint view for every provider,
        // not just the self-hosted one: the card renders an editable address with a
        // working reset, and `baseUrlConfigured` reflects an actual override.
        const view = endpointViewOf(meta.name, baseUrls);
        providers.push({
            name: meta.name,
            label: meta.label,
            description: meta.description,
            enabled: enabledMap[meta.name] !== false,
            baseUrl: view?.effectiveBaseUrl ?? meta.defaultBaseUrl,
            defaultBaseUrl: view?.defaultBaseUrl ?? meta.defaultBaseUrl,
            baseUrlConfigured: view?.isOverridden ?? false,
            baseUrlForeign: view?.isOverridden ? isForeignOverride(meta.name, view.effectiveBaseUrl) : false,
            credRef: ref,
            keyConfigured: cred.configured,
            keyWritable: cred.writable,
            keyHint: pool.length > 0 ? poolSummary(pool)[0].hint : undefined,
            poolSize: pool.length,
            keys: pool.map((e) => ({ id: keyIdOf(e.key), hint: hintOf(e.key), healthy: e.healthy })),
            options: buildProviderOptionView(meta.name, providerOpts[meta.name]),
        });
    }
    // Custom sources ride the same list so the card, the routing editor and the
    // executor all agree on one set of source ids.
    for (const config of customProviders) {
        const refs = credentialRefsOf(config.id, config.auth.mode);
        const primaryRef = refs.key ?? refs.username;
        const cred = primaryRef ? await deps.readCredential(primaryRef) : { configured: config.auth.mode === "none", writable: true };
        const pool = primaryRef && deps.poolEntries ? await deps.poolEntries(config.id) : [];
        providers.push({
            name: config.id,
            label: config.name,
            description: config.description ?? "",
            enabled: enabledMap[config.id] !== undefined ? enabledMap[config.id] : config.enabled,
            baseUrl: config.endpoint.baseUrl,
            defaultBaseUrl: config.endpoint.baseUrl,
            baseUrlConfigured: false,
            custom: true,
            protocol: config.protocol,
            revision: config.revision,
            authMode: config.auth.mode,
            credRef: primaryRef ?? "",
            keyConfigured: config.auth.mode === "none" ? true : cred.configured,
            keyWritable: true,
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
        proxy: deps.proxyStatus ? await deps.proxyStatus() : undefined,
        searchRoutingPolicy: cfg.searchRoutingPolicy ?? "ordered",
        platformEnabled,
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
    if (p.providerBaseUrls && typeof p.providerBaseUrls === "object") {
        // Normalize on the way in: a malformed entry is dropped (restoring the
        // official endpoint) instead of being persisted and failing at request time.
        patch.providerBaseUrls = sanitizeBaseUrlOverrides(p.providerBaseUrls);
    }
    if (p.providerEnabled && typeof p.providerEnabled === "object")
        patch.providerEnabled = p.providerEnabled;
    if (p.platformEnabled && typeof p.platformEnabled === "object") {
        patch.platformEnabled = p.platformEnabled;
        deps.sourceRegistry.setPlatformEnabled(p.platformEnabled);
    }
    if (p.providerOptions && typeof p.providerOptions === "object")
        patch.providerOptions = p.providerOptions;
    await deps.writeConfig(patch); // persist BEFORE reporting success
    return { saved: true };
}
/** Dedicated routing edit: policy + ordered provider list in ONE atomic write. */
async function handleRoutingSet(deps, payload) {
    const p = (payload ?? {});
    const policy = p.policy;
    if (policy !== "ordered" && policy !== "round-robin" && policy !== "random") {
        throw new Error("invalid routing policy");
    }
    if (!Array.isArray(p.orderedProviders) || p.orderedProviders.length === 0) {
        throw new Error("orderedProviders required");
    }
    const seen = new Set();
    const ordered = [];
    for (const raw of p.orderedProviders) {
        const name = String(raw).trim().toLowerCase();
        if (name === "" || seen.has(name))
            continue;
        // Validate against the registry before persisting.
        getProvider(name);
        seen.add(name);
        ordered.push(name);
    }
    if (ordered.length === 0)
        throw new Error("no valid providers");
    await deps.writeConfig({
        searchRoutingPolicy: policy,
        defaultProvider: ordered[0],
        fallbackOrder: ordered.slice(1),
    });
    return { saved: true, policy, defaultProvider: ordered[0], fallbackOrder: ordered.slice(1) };
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
async function handleVersionCheck(deps) {
    if (!deps.checkVersion)
        throw new Error("version check unavailable");
    return deps.checkVersion();
}
async function handleSearchModeGet(deps, payload) {
    const sessionId = String(payload?.sessionId ?? "");
    if (!sessionId)
        throw new Error("missing sessionId");
    if (!deps.searchMode)
        throw new Error("search-mode runtime unavailable");
    return deps.searchMode.view(sessionId);
}
async function handleSearchModeSet(deps, payload) {
    const p = (payload ?? {});
    const sessionId = String(p.sessionId ?? "");
    const mode = p.mode;
    if (!sessionId)
        throw new Error("missing sessionId");
    if (mode !== "auto" && mode !== "required")
        throw new Error("invalid mode");
    if (!deps.searchMode)
        throw new Error("search-mode runtime unavailable");
    return deps.searchMode.set(sessionId, mode);
}
async function handleProviderOptionsSet(deps, payload) {
    const p = (payload ?? {});
    const provider = String(p.provider ?? "").trim().toLowerCase();
    if (!provider)
        throw new Error("missing provider");
    const meta = PROVIDER_LIST.find((m) => m.name === provider);
    if (!meta)
        throw new Error(`unknown provider: ${provider}`);
    const rawOpts = (p.options && typeof p.options === "object") ? p.options : {};
    const cleaned = sanitizeProviderOptions(provider, rawOpts);
    const cfg = deps.readConfig();
    const currentMerged = { ...(cfg.providerOptions ?? {}) };
    currentMerged[provider] = cleaned;
    await deps.writeConfig({ providerOptions: currentMerged });
    return buildProviderOptionView(provider, cleaned);
}
async function handleProviderOptionsBatchSet(deps, payload) {
    const p = (payload ?? {});
    if (!p.providers || typeof p.providers !== "object")
        throw new Error("missing providers");
    // Validate all provider names first (atomic: reject the whole batch if any
    // name is unknown) then sanitize every option payload.
    const sanitized = new Map();
    for (const [rawName, rawOptions] of Object.entries(p.providers)) {
        const provider = rawName.trim().toLowerCase();
        const meta = PROVIDER_LIST.find((m) => m.name === provider);
        if (!meta)
            throw new Error(`unknown provider: ${provider}`);
        if (rawOptions === null) {
            sanitized.set(provider, null);
        }
        else if (typeof rawOptions === "object") {
            sanitized.set(provider, sanitizeProviderOptions(provider, rawOptions));
        }
        else {
            throw new Error(`invalid options for ${provider}`);
        }
    }
    // Single read + mutate + write: atomic.
    const cfg = deps.readConfig();
    const current = { ...(cfg.providerOptions ?? {}) };
    for (const [provider, options] of sanitized) {
        if (options === null) {
            delete current[provider];
        }
        else {
            current[provider] = options;
        }
    }
    await deps.writeConfig({ providerOptions: current });
    return Object.fromEntries([...sanitized.keys()].map((provider) => [
        provider,
        buildProviderOptionView(provider, current[provider]),
    ]));
}
async function handleProviderOptionsReset(deps, payload) {
    const p = (payload ?? {});
    const provider = String(p.provider ?? "").trim().toLowerCase();
    if (!provider)
        throw new Error("missing provider");
    const meta = PROVIDER_LIST.find((m) => m.name === provider);
    if (!meta)
        throw new Error(`unknown provider: ${provider}`);
    const cfg = deps.readConfig();
    const currentMerged = { ...(cfg.providerOptions ?? {}) };
    delete currentMerged[provider];
    await deps.writeConfig({ providerOptions: currentMerged });
    return buildProviderOptionView(provider, undefined);
}
// ---------------------------------------------------------------------------
// Issue #9 — custom search source endpoints
// ---------------------------------------------------------------------------
/** Persisted custom sources, revalidated on every read. */
function readCustomProviders(deps) {
    return loadCustomProviders(deps.readConfig().customProviders);
}
/** Find one custom source or throw a `not-found` conflict-style error. */
function requireCustomProvider(deps, id) {
    const sourceId = validateSourceId(id);
    const list = readCustomProviders(deps);
    const config = list.find((entry) => entry.id === sourceId);
    if (!config)
        throw new RouteError("not-found", `Unknown custom source "${sourceId}"`, 404);
    return { list, config };
}
/** A route failure carrying an explicit HTTP status + machine code. */
export class RouteError extends Error {
    code;
    status;
    constructor(code, message, status = 400) {
        super(message);
        this.name = "RouteError";
        this.code = code;
        this.status = status;
    }
}
/** Credential state for one source, as surfaced to the card (never values). */
async function describeSourceCredentials(deps, refs) {
    const out = {};
    for (const ref of Object.values(refs ?? {})) {
        if (typeof ref !== "string")
            continue;
        const cred = await deps.readCredential(ref);
        out[ref] = { configured: cred.configured, writable: cred.writable };
    }
    return out;
}
/**
 * `sources/describe` — one unified list of built-in and custom sources.
 *
 * Custom sources are returned with their credential state and resolved
 * endpoint, but never a credential value.
 */
async function handleSourcesDescribe(deps) {
    const builtIns = PROVIDER_LIST.map((meta) => {
        const endpoint = endpointViewOf(meta.name, undefined);
        return {
            sourceId: meta.name,
            kind: "builtin",
            label: meta.label,
            description: meta.description,
            enabled: false, // filled by config/get; describe is source metadata only
            defaultBaseUrl: endpoint?.defaultBaseUrl,
            searchPath: PROVIDER_ENDPOINTS[meta.name]?.search.url,
            authMode: meta.needsBaseUrl ? "optional" : "api-key",
        };
    });
    const custom = await Promise.all(readCustomProviders(deps).map(async (config) => {
        const refs = credentialRefsOf(config.id, config.auth.mode);
        return {
            sourceId: config.id,
            kind: "custom",
            label: config.name,
            description: config.description ?? "",
            enabled: config.enabled,
            protocol: config.protocol,
            authMode: config.auth.mode,
            revision: config.revision,
            baseUrl: config.endpoint.baseUrl,
            searchPath: config.endpoint.searchPath,
            method: config.endpoint.method,
            encoding: config.endpoint.encoding,
            credentialRefs: Object.values(refs),
            credentials: await describeSourceCredentials(deps, refs),
        };
    }));
    return { builtIns, custom };
}
/** `sources/create` */
async function handleSourceCreate(deps, payload) {
    const p = (payload ?? {});
    const list = readCustomProviders(deps);
    if (list.length >= MAX_CUSTOM_PROVIDERS) {
        throw new RouteError("config", `At most ${MAX_CUSTOM_PROVIDERS} custom sources are allowed`, 409);
    }
    // Validate BEFORE generating an id, so an invalid draft never allocates one.
    const draft = validateDraft(p.source);
    const id = generateSourceId(list.map((entry) => entry.id));
    const config = { schemaVersion: 1, id, revision: 1, ...draft };
    // Persist first, then write credentials. Creating the credential before the
    // config is durable would leave an orphan secret behind on failure.
    await deps.writeConfig({ customProviders: [...list, config] });
    let credentialConfigured = false;
    const refs = credentialRefsOf(id, config.auth.mode);
    try {
        credentialConfigured = await applyCredentialPatch(deps, refs, p.credential);
    }
    catch (err) {
        // Compensation: the config write succeeded but the credential did not, so
        // roll the source back rather than leaving a half-configured entry.
        await deps.writeConfig({ customProviders: list }).catch(() => { });
        await deps.revokeSourceCredentials?.(id).catch(() => { });
        deps.forgetSource?.(id);
        throw err instanceof Error ? new RouteError("config", err.message, 400) : err;
    }
    return { id, saved: true, revision: config.revision, credentialConfigured };
}
/**
 * Apply the optional `credential` patch from a create/update payload.
 * @returns whether a usable credential is now present.
 */
async function applyCredentialPatch(deps, refs, patch) {
    if (patch === undefined || patch === null)
        return false;
    if (typeof patch !== "object")
        throw new RouteError("config", "credential must be an object", 400);
    const operation = patch.operation;
    if (operation !== "set")
        throw new RouteError("config", "credential.operation must be \"set\"", 400);
    if (refs.username !== undefined || refs.password !== undefined) {
        const username = patch.username;
        const password = patch.password;
        let configured = false;
        if (typeof username === "string" && username.length > 0) {
            await deps.writeCredential(refs.username, username);
            configured = true;
        }
        if (typeof password === "string" && password.length > 0) {
            await deps.writeCredential(refs.password, password);
            configured = true;
        }
        return configured;
    }
    const value = patch.value;
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new RouteError("config", "credential.value must be a non-empty string", 400);
    }
    if (refs.key === undefined)
        return false; // auth mode "none": nothing to store
    await deps.writeCredential(refs.key, value);
    return true;
}
/** `sources/update` — optimistic concurrency via `revision`. */
async function handleSourceUpdate(deps, payload) {
    const p = (payload ?? {});
    const { list, config } = requireCustomProvider(deps, String(p.id ?? ""));
    const expected = p.revision;
    if (typeof expected !== "number" || !Number.isInteger(expected)) {
        throw new RouteError("config", "revision is required", 400);
    }
    if (expected !== config.revision) {
        // Refuse rather than overwrite: another editor (or another tab) saved first.
        throw new RouteError("conflict", "This source was modified by another operation; reload before saving", 409);
    }
    // A patch is merged onto the stored source, then the WHOLE result is
    // revalidated — a patch cannot introduce a shape the schema would reject.
    const patch = (p.patch ?? {});
    const merged = {
        ...config,
        ...patch,
        endpoint: patch.endpoint !== undefined ? { ...config.endpoint, ...patch.endpoint } : config.endpoint,
        auth: patch.auth !== undefined ? { ...config.auth, ...patch.auth } : config.auth,
        request: patch.request !== undefined ? { ...(config.request ?? {}), ...patch.request } : config.request,
        response: patch.response !== undefined ? { ...(config.response ?? {}), ...patch.response } : config.response,
    };
    const draft = validateDraft(merged, "patch");
    const next = { schemaVersion: 1, id: config.id, revision: config.revision + 1, ...draft };
    const nextList = list.map((entry) => (entry.id === config.id ? next : entry));
    await deps.writeConfig({ customProviders: nextList });
    // A changed endpoint invalidates health/cooldown recorded against the OLD
    // destination, and a changed auth mode changes which credential refs exist.
    if (next.endpoint.baseUrl !== config.endpoint.baseUrl ||
        next.endpoint.searchPath !== config.endpoint.searchPath ||
        next.auth.mode !== config.auth.mode) {
        deps.forgetSource?.(config.id);
    }
    if (p.credential !== undefined) {
        await applyCredentialPatch(deps, credentialRefsOf(config.id, next.auth.mode), p.credential);
    }
    return { id: config.id, saved: true, revision: next.revision };
}
/** `sources/delete` — remove from config + routing first, then revoke secrets. */
async function handleSourceDelete(deps, payload) {
    const p = (payload ?? {});
    const { list, config } = requireCustomProvider(deps, String(p.id ?? ""));
    const nextList = list.filter((entry) => entry.id !== config.id);
    // Drop every routing reference in the SAME write as the removal, so the
    // executor can never try to route to a source whose config is gone.
    const cfg = deps.readConfig();
    const fallbackOrder = (cfg.fallbackOrder ?? []).filter((name) => name !== config.id);
    const defaultProvider = cfg.defaultProvider === config.id
        ? (PROVIDER_LIST.find((meta) => meta.name !== config.id)?.name ?? fallbackOrder[0] ?? "exa")
        : cfg.defaultProvider;
    const providerEnabled = { ...(cfg.providerEnabled ?? {}) };
    delete providerEnabled[config.id];
    await deps.writeConfig({ customProviders: nextList, fallbackOrder, defaultProvider, providerEnabled });
    deps.forgetSource?.(config.id);
    // Credential cleanup happens AFTER the source is unusable. If it fails the
    // source is already disabled and unroutable, and the failure is reported as
    // retryable cleanup state rather than being swallowed.
    const revoked = (await deps.revokeSourceCredentials?.(config.id)) ?? { removed: [], failed: [] };
    return {
        deleted: true,
        credentialsRemoved: revoked.removed,
        credentialsPending: revoked.failed,
        ...(revoked.failed.length > 0
            ? { warning: `Credentials for ${revoked.failed.join(", ")} could not be removed; retry the delete to clean them up` }
            : {}),
    };
}
/** `sources/test` — draft or saved, never touching live health state. */
async function handleSourceTest(deps, payload) {
    const p = (payload ?? {});
    if (!deps.testSource)
        throw new RouteError("config", "source testing is unavailable", 503);
    const query = typeof p.query === "string" && p.query.trim() !== "" ? p.query.trim() : "OpenAI";
    if (p.sourceId !== undefined) {
        const { config } = requireCustomProvider(deps, String(p.sourceId));
        return deps.testSource({ sourceId: config.id, query });
    }
    return deps.testSource({ draft: p.draft, query });
}
/**
 * `sources/endpoint-set` — set or clear a built-in provider's base URL.
 *
 * An empty value DELETES the override (restoring the official endpoint) rather
 * than storing an empty string, so "reset" and "never configured" are the same
 * state. A target on a different host than the official endpoint is reported so
 * the UI can confirm before an existing credential is sent somewhere new.
 */
async function handleSourceEndpointSet(deps, payload) {
    const p = (payload ?? {});
    const provider = String(p.provider ?? "").trim().toLowerCase();
    if (!provider)
        throw new RouteError("config", "missing provider", 400);
    const endpoint = endpointViewOf(provider, undefined);
    if (!endpoint)
        throw new RouteError("config", `unknown provider: ${provider}`, 400);
    const raw = p.baseUrl;
    const value = typeof raw === "string" ? raw.trim() : "";
    const cfg = deps.readConfig();
    const overrides = { ...(cfg.providerBaseUrls ?? {}) };
    if (value === "") {
        delete overrides[provider];
        await deps.writeConfig({ providerBaseUrls: overrides });
        deps.forgetSource?.(provider);
        return { provider, baseUrl: endpoint.defaultBaseUrl, isOverridden: false, saved: true };
    }
    // Validate as a URL before persisting: the same rules the request builder
    // enforces, so a stored override is always dialable.
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new RouteError("invalid-url", "Service address must be an absolute http(s) URL", 400);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new RouteError("invalid-url", "Service address must use the http or https scheme", 400);
    }
    if (parsed.username || parsed.password) {
        throw new RouteError("invalid-url", "Service address must not embed credentials", 400);
    }
    if (parsed.search || parsed.hash) {
        throw new RouteError("invalid-url", "Service address must not contain a query string or fragment", 400);
    }
    const foreign = isForeignOverride(provider, parsed.href);
    if (foreign && p.confirmForeign !== true) {
        // Require explicit confirmation: this is the point where an already-stored
        // API key starts being sent to a different service.
        throw new RouteError("conflict", `Changing the service address sends the configured API key to "${parsed.host}" instead of the official endpoint. Confirm to continue.`, 409);
    }
    overrides[provider] = parsed.href.replace(/\/+$/, "");
    await deps.writeConfig({ providerBaseUrls: overrides });
    // Only THIS provider's cooldown/health is invalidated — a global clear would
    // discard valid state for every other source.
    deps.forgetSource?.(provider);
    const view = endpointViewOf(provider, overrides);
    return {
        provider,
        baseUrl: view?.effectiveBaseUrl ?? overrides[provider],
        isOverridden: true,
        foreignHost: foreign,
        saved: true,
    };
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
    "version/check": (deps) => handleVersionCheck(deps),
    "search-mode/get": (deps, payload) => handleSearchModeGet(deps, payload),
    "search-mode/set": (deps, payload) => handleSearchModeSet(deps, payload),
    "provider-options/set": (deps, payload) => handleProviderOptionsSet(deps, payload),
    "provider-options/reset": (deps, payload) => handleProviderOptionsReset(deps, payload),
    "provider-options/batch": (deps, payload) => handleProviderOptionsBatchSet(deps, payload),
    "routing/set": (deps, payload) => handleRoutingSet(deps, payload),
    // Issue #9 — custom search sources
    "sources/describe": (deps) => handleSourcesDescribe(deps),
    "sources/create": (deps, payload) => handleSourceCreate(deps, payload),
    "sources/update": (deps, payload) => handleSourceUpdate(deps, payload),
    "sources/delete": (deps, payload) => handleSourceDelete(deps, payload),
    "sources/test": (deps, payload) => handleSourceTest(deps, payload),
    "sources/endpoint-set": (deps, payload) => handleSourceEndpointSet(deps, payload),
    "platform/status": (deps) => handlePlatformStatus(deps),
    "platform/login": (deps, payload) => handlePlatformLogin(deps, payload),
    "platform/stop": (deps, payload) => handlePlatformStop(deps, payload),
    "platform/reset": (deps, payload) => handlePlatformReset(deps, payload),
};
/** Register the fenced `/web-tools/api` prefix. Returns the disposer. */
export function registerRoutes(ctx, deps) {
    return ctx.webServer.register({
        kind: "prefix",
        path: API_PREFIX,
        handler: async (req, res) => {
            // Configuration plane: loopback PEER only + same-origin, never trustedHosts.
            if (configPlaneTrust(req) === false) {
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
                // Classified failures keep their own status + stable machine code so
                // the editor can react (e.g. reload on `conflict`) instead of showing
                // an opaque 500.
                if (e instanceof RouteError) {
                    writeError(res, e.status, e.code, e.message);
                    return;
                }
                if (e instanceof CustomProviderValidationError) {
                    writeError(res, 400, e.code, e.message);
                    return;
                }
                writeError(res, 500, "internal", e instanceof Error ? e.message : String(e));
            }
        },
    });
}
