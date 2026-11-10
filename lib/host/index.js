import { Config as PluginConfig, installConfig } from "./config.js";
import { createSearchProvider, createFetchProvider, createPoolStore, PROVIDER_ID } from "./registry.js";
import { registerRoutes } from "./routes.js";
import { Stats } from "./stats.js";
import { CURRENT_VERSION, compareVersions } from "../shared/version.js";
import { buildPool, selectIndex, markUsed, markUnhealthy, resetHealth } from "./pool.js";
import { credRefOf, getProvider, PROVIDER_LIST, quotaOf } from "./providers/index.js";
import { seedBraveQuota, setBraveQuotaPersist } from "./providers/brave.js";
import { seedKeenableUsageCache, setKeenableUsagePersist, } from "./providers/keenable-usage.js";
import { createQuotaPersistScheduler } from "./quota-persist.js";
import { isKeylessSelfHosted } from "./providers/types.js";
import { mergePoolQuota } from "./quota.js";
import { fetchWithProxy, proxyStatus, proxyFromEnv, proxyFromSystem, getProxyDispatcher } from "./fetch-proxy.js";
import { installSearchModeRuntime, SearchModeRuntime, createSearchModeMessages } from "./search-mode-runtime.js";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { createProviderHealthStore } from "./provider-health.js";
import { createCachedSearchProvider, createCachedFetchProvider, runWithoutCache } from "./cached-web.js";
import { fingerprint as configFingerprint } from "./result-cache.js";
import { transact, setGlobalOutboundAuthorizations, isLocalOrPrivateHost, resolvesToPrivateIp, TransportError } from "./provider-transport.js";
import { OUTBOUND_AUTHORIZATIONS, buildProviderSnapshot, policyForCustomSource, } from "./custom-provider-registry.js";
import { createCustomAdapter } from "./providers/custom-compatible.js";
import { allCredentialRefsOf, credentialRefsOf, loadCustomProviders, validateDraft, validateSourceId, CustomProviderValidationError, } from "./custom-provider-schema.js";
import { SpecializedSourceRegistry } from "./sources/registry.js";
import { XiaohongshuSource } from "./sources/xiaohongshu.js";
import { XSource } from "./sources/x.js";
import { createNativeBrowserRuntime } from "./browser/index.js";
import { extractSearchHints } from "./search-hints.js";
import { toRoutedFetchResponse, describeDegradation, formatPlatformSnippet, } from "./sources/routed-response.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = "dsh-web-tools";
/** Services required by this plugin. */
export const inject = ["webServer", "settings", "credentials", "web", "agents", "commands"];
/**
 * Plugin-level config: the same schemastery schema as the settings namespace.
 * Cordis requires `Config` to be a schema instance (it calls `.validate` when
 * resolving plugin config); an empty object would crash at load.
 */
export const Config = PluginConfig;
const RELEASES_API = "https://api.github.com/repos/A3Boy/dsh-web-tools/releases/latest";
const RELEASES_URL = "https://github.com/A3Boy/dsh-web-tools/releases";
const VERSION_CACHE_MS = 6 * 60 * 60 * 1000;
let versionCache = null;
export { toRoutedFetchResponse, describeDegradation, formatPlatformSnippet };
/** Release lookup is best-effort: startup and settings must work offline. */
async function checkVersion() {
    if (versionCache && Date.now() - versionCache.fetchedAt < VERSION_CACHE_MS)
        return versionCache.value;
    const fallback = { currentVersion: CURRENT_VERSION, updateAvailable: false };
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        timer.unref?.();
        let response;
        try {
            response = await fetchWithProxy(RELEASES_API, {
                signal: controller.signal,
                headers: {
                    accept: "application/vnd.github+json",
                    "user-agent": `dsh-web-tools/${CURRENT_VERSION}`,
                },
            });
        }
        finally {
            clearTimeout(timer);
        }
        // A repository without releases is a valid "no update" state.
        if (response.status === 404) {
            versionCache = { fetchedAt: Date.now(), value: fallback };
            return fallback;
        }
        if (!response.ok)
            throw new Error(`GitHub releases returned HTTP ${response.status}`);
        const release = await response.json();
        const latestVersion = typeof release.tag_name === "string" ? release.tag_name.replace(/^v/i, "") : "";
        if (!latestVersion || release.draft === true || release.prerelease === true)
            return fallback;
        const value = {
            currentVersion: CURRENT_VERSION,
            latestVersion,
            updateAvailable: compareVersions(latestVersion, CURRENT_VERSION) > 0,
            releaseUrl: typeof release.html_url === "string" ? release.html_url : RELEASES_URL,
            releaseName: typeof release.name === "string" && release.name.trim() ? release.name : `v${latestVersion}`,
            publishedAt: typeof release.published_at === "string" ? release.published_at : undefined,
        };
        versionCache = { fetchedAt: Date.now(), value };
        return value;
    }
    catch {
        // Do not cache transient network failures; the next settings open can retry.
        return fallback;
    }
}
/** Resolve one credential ref's state + optional value (Host side only). */
async function readCredential(ctx, ref) {
    try {
        const credentials = ctx.credentials;
        if (!credentials?.resolve)
            return { configured: false, writable: true };
        const resolved = await credentials.resolve(ref);
        const value = resolved?.value;
        return {
            configured: typeof value === "string" && value.length > 0,
            source: resolved?.source,
            writable: true,
            ...(typeof value === "string" ? { value } : {}),
        };
    }
    catch {
        return { configured: false, writable: true };
    }
}
/**
 * Write a credential value. An empty string UNSETS the credential — the
 * credentials-local provider refuses to store empty values ("use unset"),
 * so removing the last key must unset rather than set("").
 */
async function writeCredential(ctx, ref, value) {
    const credentials = ctx.credentials;
    if (!credentials?.set || !credentials?.unset)
        throw new Error("credentials service unavailable");
    if (typeof value === "string" && value.length === 0) {
        await credentials.unset(ref);
        return;
    }
    await credentials.set(ref, value);
}
export function apply(ctx, config) {
    const stats = new Stats();
    const configHandle = installConfig(ctx, config);
    const readConfig = () => configHandle.read();
    /** Coalesced writer for Brave's header-derived, display-only quota cache. */
    const braveQuotaPersist = createQuotaPersistScheduler((cache) => {
        void configHandle.write({ braveQuotaCache: cache }).catch(() => { });
    });
    /** Coalesced writer for the Keenable per-call usage ledger. */
    const keenableUsagePersist = createQuotaPersistScheduler((cache) => {
        void configHandle.write({ keenableUsageCache: cache }).catch(() => { });
    });
    // ---- ctx.web search + fetch providers ----------------------------------
    const resolveRuntimeConfig = () => {
        const cfg = readConfig();
        return {
            enabled: cfg.enabled !== false,
            defaultProvider: cfg.defaultProvider,
            providerAttemptTimeoutMs: cfg.providerAttemptTimeoutMs,
            fallbackOrder: cfg.fallbackOrder,
            searchRoutingPolicy: cfg.searchRoutingPolicy,
            retrievalStrategy: cfg.retrievalStrategy,
            providerBaseUrls: cfg.providerBaseUrls,
            enabledProviders: cfg.providerEnabled,
            providerOptions: cfg.providerOptions,
        };
    };
    const resolveKeys = async (providerName) => {
        // Custom sources own host-derived refs (and may use two refs for Basic).
        // Resolve through the catalog so both kinds share one pool store, and a
        // custom source's key can never collide with a built-in's.
        const entry = buildSnapshot().get(providerName);
        if (entry && !entry.builtIn) {
            const refs = entry.refs;
            if (refs.username !== undefined || refs.password !== undefined) {
                // Basic auth uses two separate credentials refs so passwords containing
                // delimiters (comma, semicolon, space) are never corrupted by splitting.
                // If username is configured, return an account identifier so the pool
                // allocates a healthy dispatch slot rather than skipping the provider.
                const user = (await readCredential(ctx, refs.username ?? "")).value ?? "";
                return user ? `basic:${user}` : "";
            }
            if (refs.key === undefined)
                return "";
            const cred = await readCredential(ctx, refs.key);
            return cred.value ?? "";
        }
        const ref = credRefOf(providerName);
        const cred = await readCredential(ctx, ref);
        return cred.value ?? "";
    };
    // ---- Issue #9: credentials, secure transport, dynamic catalog -----------
    /** Credential access by ref, for custom source adapters. */
    const credentialSource = {
        read: async (ref) => (ref ? ((await readCredential(ctx, ref)).value ?? "") : ""),
    };
    /** The ambient proxy, if any (env var first, then the Windows system proxy). */
    const currentProxyUrl = () => proxyFromEnv() ?? proxyFromSystem();
    /** All outbound requests for custom sources go through the guarded transport. */
    const secureTransport = (request) => transact(request, {
        proxyUrl: currentProxyUrl,
        proxyDispatcher: getProxyDispatcher,
    });
    /** Credential refs for one source id, resolved against the live catalog. */
    const buildSnapshot = () => {
        const cfg = readConfig();
        const authorizations = [
            ...OUTBOUND_AUTHORIZATIONS,
            ...(Array.isArray(cfg.outboundAuthorizations) ? cfg.outboundAuthorizations : []),
        ];
        return buildProviderSnapshot({
            providerBaseUrls: cfg.providerBaseUrls ?? {},
            customProviders: loadCustomProviders(cfg.customProviders),
            credentials: credentialSource,
            transport: secureTransport,
            authorizations,
        });
    };
    const resolveSnapshot = () => buildSnapshot();
    const sourceRefsOf = (sourceId) => buildSnapshot().get(sourceId)?.refs;
    // ONE shared pool store for search + fetch: they see the same key usage
    // and health, and rebuild only when a credential actually changes.
    const poolStore = createPoolStore(resolveKeys);
    // ONE shared health store so search + fetch respect the same cooldowns.
    const healthStore = createProviderHealthStore();
    const sourceRegistry = new SpecializedSourceRegistry();
    const rawSearchProvider = createSearchProvider(resolveRuntimeConfig, resolveKeys, {
        record: (e) => stats.record({ ...e, at: Date.now() }),
        summary: () => stats.summary(),
    }, undefined, poolStore, healthStore, resolveSnapshot);
    const rawFetchProvider = createFetchProvider(resolveRuntimeConfig, resolveKeys, undefined, poolStore, healthStore, undefined, resolveSnapshot, {
        record: (e) => stats.record({ ...e, at: Date.now() }),
    });
    // Short-lived result cache + in-flight coalescing for the GENERAL chain only
    // (platform sources stay uncached). Any provider / routing / endpoint /
    // custom-source change alters the fingerprint, which invalidates old entries.
    const cacheFingerprint = () => configFingerprint({ runtime: resolveRuntimeConfig(), config: readConfig() });
    const generalSearchProvider = createCachedSearchProvider(rawSearchProvider, { fingerprint: cacheFingerprint });
    const generalFetchProvider = createCachedFetchProvider(rawFetchProvider, { fingerprint: cacheFingerprint });
    sourceRegistry.setFallbackProviders(generalSearchProvider, generalFetchProvider);
    // Sync platformEnabled from config on boot and live updates
    configHandle.onMounted(() => {
        const cfg = readConfig();
        if (cfg.platformEnabled) {
            sourceRegistry.setPlatformEnabled(cfg.platformEnabled);
        }
    });
    // Wrap search provider with SpecializedSourceRouter for XHS / X transparent platform handling
    const routedSearchProvider = {
        id: PROVIDER_ID,
        available: () => generalSearchProvider.available(),
        search: async (request, signal) => {
            const outcome = await sourceRegistry.search(request.query, { maxResults: request.maxResults, hints: extractSearchHints(request.query) }, signal);
            if (outcome.error) {
                throw new Error(`[${outcome.error.code}] ${outcome.error.message}`);
            }
            return {
                // A degraded answer must SAY it is degraded: silently returning
                // site:-filtered web results as if they were in-app posts is how a
                // search looks successful while being much worse.
                ...(outcome.degraded ? { content: describeDegradation(outcome.degraded), degraded: outcome.degraded } : {}),
                ...(outcome.diagnostics ? { diagnostics: outcome.diagnostics } : {}),
                sources: outcome.items.map((item) => ({
                    url: item.url,
                    title: item.title,
                    snippet: formatPlatformSnippet(item),
                    publishedAt: item.publishedAt,
                })),
                truncated: false,
                // Forward the executor's diagnostics so the settings card can show the
                // serving backend, the attempt ledger and whether the answer was fused.
                ...(outcome.backend !== undefined ? { backend: outcome.backend } : {}),
                ...(outcome.attempts !== undefined ? { attempts: outcome.attempts } : {}),
                ...(outcome.fused !== undefined ? { fused: outcome.fused } : {}),
            };
        },
    };
    ctx.web.registerSearchProvider(routedSearchProvider);
    // Wrap fetch provider with SpecializedSourceRouter
    const routedFetchProvider = {
        id: `${PROVIDER_ID}-fetch`,
        available: () => generalFetchProvider.available(),
        fetch: async (request, signal) => {
            const outcome = await sourceRegistry.fetch(request.url, signal);
            return toRoutedFetchResponse(request.url, outcome);
        },
    };
    ctx.web.registerFetchProvider(routedFetchProvider);
    // Specialized Sources: Register Xiaohongshu and Twitter/X with NativeBrowserRuntime
    const nativeRuntime = createNativeBrowserRuntime();
    const xhsSource = new XiaohongshuSource(nativeRuntime);
    const xSource = new XSource(nativeRuntime);
    sourceRegistry.registerSource(xhsSource);
    sourceRegistry.registerSource(xSource);
    // Hook NativeBrowserRuntime lifecycle into Cordis effect
    ctx.effect(() => {
        return () => {
            nativeRuntime.dispose().catch(() => { });
        };
    }, "dsh-web-tools: native browser runtime");
    /** Run one real minimal search through a single provider (test connection). */
    async function testProviderSearch(providerName, query) {
        const adapter = getProvider(providerName);
        const started = Date.now();
        try {
            // Keyless self-hosted providers (SearXNG) work without any key.
            let key = "";
            if (!isKeylessSelfHosted(adapter)) {
                // Use the SHARED pool store so a failed probe marks the tested key
                // unhealthy — the card's per-key health must reflect reality, not a
                // fresh pool where every key always looks healthy.
                const entries = await poolStore.poolOf(providerName);
                if (entries.length === 0)
                    throw Object.assign(new Error("no API key configured"), { code: "config" });
                if (!entries.some((e) => e.healthy))
                    resetHealth(entries);
                const index = selectIndex(entries);
                const entry = entries[index];
                key = (entry?.key ?? "").trim();
                try {
                    const outcome = await adapter.search(query, 1, key, readConfig().providerBaseUrls[providerName]);
                    markUsed(entries, index);
                    if (!entry.healthy)
                        entry.healthy = true;
                    const latencyMs = Date.now() - started;
                    return {
                        ok: true,
                        latencyMs,
                        resultCount: outcome.sources.length,
                        title: outcome.sources[0]?.title,
                    };
                }
                catch (e) {
                    // Same policy as the executor: only an auth failure indicts the key.
                    const err = toProviderError(e);
                    if (err.code === "auth")
                        markUnhealthy(entries, index);
                    throw err;
                }
            }
            const outcome = await adapter.search(query, 1, key, readConfig().providerBaseUrls[providerName]);
            const latencyMs = Date.now() - started;
            return {
                ok: true,
                latencyMs,
                resultCount: outcome.sources.length,
                title: outcome.sources[0]?.title,
            };
        }
        catch (e) {
            const err = toProviderError(e);
            return { ok: false, error: { code: err.code, message: err.message } };
        }
    }
    /** Run the REAL search path (default provider + fallback) for the card.
     *  Delegates to the same provider used by agent web_search, so Test Search
     *  never drifts from production behavior. */
    /** Run the REAL search path (default provider + fallback) for the card.
     *  Delegates to the same provider used by agent web_search, so Test Search
     *  never drifts from production behavior. Total latency measured here. */
    async function testFullSearch(query) {
        const started = Date.now();
        try {
            // Manual card test must measure the real chain, never a cached answer.
            const result = await runWithoutCache(() => routedSearchProvider.search({ query, maxResults: 5 }, undefined));
            const hints = extractSearchHints(query);
            return {
                ok: true,
                backend: result.backend,
                fused: result.fused === true,
                degraded: result.degraded,
                hints: { platform: hints.platform, cleanQuery: hints.cleanQuery },
                diagnostics: result.diagnostics,
                latencyMs: Date.now() - started,
                resultCount: result.sources.length,
                results: result.sources.slice(0, 5).map((s) => ({ title: s.title ?? s.url, url: s.url, snippet: s.snippet ?? "" })),
                attempts: result.attempts,
            };
        }
        catch (e) {
            const err = toProviderError(e);
            return {
                ok: false,
                latencyMs: Date.now() - started,
                error: { code: err.code, message: err.message },
            };
        }
    }
    /** Quota cache: { fetchedAt, per provider snapshot }. */
    let quotaCache = null;
    const QUOTA_CACHE_MS = 5 * 60 * 1000; // 5 min — quota is display-only, no 30s polling
    const QUOTA_TIMEOUT_MS = 8000;
    async function describeQuotas(force = false) {
        if (!force && quotaCache && Date.now() - quotaCache.fetchedAt < QUOTA_CACHE_MS)
            return quotaCache.quotas;
        const cfg = readConfig();
        const chainNames = new Set([cfg.defaultProvider, ...cfg.fallbackOrder]);
        const summary = stats.summary();
        // Read all credentials in parallel ONCE
        const credentialEntries = await Promise.all(PROVIDER_LIST.map(async (meta) => {
            const ref = credRefOf(meta.name);
            const cred = await readCredential(ctx, ref);
            return { meta, ref, cred };
        }));
        const wanted = new Set(chainNames);
        for (const { meta, cred } of credentialEntries) {
            if ((cred.value ?? "").trim().length > 0)
                wanted.add(meta.name);
        }
        const credMap = new Map(credentialEntries.map((e) => [e.meta.name, e.cred]));
        // Parallel, timeout-bounded, only providers that can report quota.
        const results = await Promise.allSettled(PROVIDER_LIST.filter((meta) => wanted.has(meta.name)).map(async (meta) => {
            const cred = credMap.get(meta.name);
            const localSearches = summary.byProvider[meta.name]?.success ?? 0;
            // Multi-key pool: query EVERY key and merge — the card shows the
            // TOTAL pool balance, not one key's. Each key is authenticated
            // separately (never join the raw string).
            const keys = buildPool(cred?.value ?? "").map((e) => e.key);
            if (keys.length === 0) {
                const snapshot = await withTimeoutMs(quotaOf(meta.name, "", cfg.providerBaseUrls[meta.name], localSearches), QUOTA_TIMEOUT_MS);
                return [meta.name, snapshot];
            }
            const perKey = await Promise.allSettled(keys.map((k) => withTimeoutMs(quotaOf(meta.name, k, cfg.providerBaseUrls[meta.name], localSearches), QUOTA_TIMEOUT_MS)));
            const fulfilled = perKey.filter((p) => p.status === "fulfilled").map((p) => p.value);
            if (fulfilled.length === 0) {
                const first = perKey.find((p) => p.status === "rejected");
                throw Object.assign(new Error(`quota check failed: ${first?.reason instanceof Error ? first.reason.message : String(first?.reason)}`), {
                    provider: meta.name,
                });
            }
            return [meta.name, mergePoolQuota(fulfilled)];
        }));
        const quotas = {};
        for (const r of results) {
            if (r.status === "fulfilled") {
                const [name, snap] = r.value;
                quotas[name] = snap;
            }
            else {
                const name = r.reason?.provider ?? "unknown";
                quotas[name] = {
                    supported: false,
                    authoritative: false,
                    unit: "unknown",
                    source: "dashboard",
                    fetchedAt: Date.now(),
                    note: `Quota check failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
                };
            }
        }
        quotaCache = { fetchedAt: Date.now(), quotas };
        return quotas;
    }
    // ---- Brave quota persistence --------------------------------------------
    // Brave has no quota endpoint; its only quota signal is the X-RateLimit-*
    // header captured during a real search. Persist those snapshots into the
    // settings namespace so a restart does not forget the last known balance.
    // Seeding MUST wait for the settings namespace (ctx.inject is async) — in
    // the synchronous apply() body readConfig() would only return defaults.
    configHandle.onMounted(() => {
        const cfg = readConfig();
        syncGlobalOutboundAuthorizations();
        const braveCache = cfg.braveQuotaCache ?? {};
        braveQuotaPersist.seed(braveCache);
        for (const [key, snap] of Object.entries(braveCache)) {
            if (key && snap && typeof snap === "object")
                seedBraveQuota(key, snap);
        }
        const keenableCache = (cfg.keenableUsageCache ?? {});
        seedKeenableUsageCache(keenableCache);
        keenableUsagePersist.seed(keenableCache);
    });
    // Coalesced: a settings write costs ~2.5s on DSH 0.1.7 (profile patch +
    // Loader reconciliation under hmr.runExclusive), and Brave reports quota in
    // search headers, so writing through per search would run that path for a
    // value the card only displays.
    setBraveQuotaPersist((apiKey, snapshot) => braveQuotaPersist.record(apiKey, snapshot));
    ctx.effect(() => () => braveQuotaPersist.dispose(), "dsh-web-tools: brave quota persistence");
    // Keenable reports the charge of every call in the response body; the
    // ledger that accumulates those numbers is display-only and persisted the
    // same coalesced way as Brave's header snapshots.
    setKeenableUsagePersist((apiKey, bucket) => keenableUsagePersist.record(apiKey, bucket));
    ctx.effect(() => () => keenableUsagePersist.dispose(), "dsh-web-tools: keenable usage persistence");
    // ---- Platform session keep-alive ----------------------------------------
    // 小红书 `web_session` and X `auth_token` expire when the profile is idle for
    // a long time, so a signed-in setup silently degrades to web results after a
    // day. A low-frequency visit to each signed-in platform lets the site refresh
    // its own cookies. Only platforms that currently report a usable session are
    // touched, and `sessionKeepAliveHours = 0` disables the sweep entirely.
    ctx.effect(() => {
        let disposed = false;
        let timer;
        const sweep = async () => {
            if (disposed)
                return;
            const hours = readConfig().sessionKeepAliveHours ?? 8;
            if (!Number.isFinite(hours) || hours <= 0)
                return;
            try {
                const statuses = await sourceRegistry.getPlatformStatuses();
                for (const status of statuses) {
                    if (disposed)
                        return;
                    if (!status.enabled || !status.sessionEstablished || !status.authenticated)
                        continue;
                    const url = status.id === "xiaohongshu"
                        ? "https://www.xiaohongshu.com/explore"
                        : "https://x.com/home";
                    try {
                        const page = await nativeRuntime.openPage(status.id, url, undefined, "interactive");
                        await page.close();
                    }
                    catch {
                        // A failed refresh must never disturb the runtime.
                    }
                }
            }
            catch {
                // Status probing is best-effort.
            }
        };
        const schedule = () => {
            if (disposed)
                return;
            const hours = readConfig().sessionKeepAliveHours ?? 8;
            if (!Number.isFinite(hours) || hours <= 0)
                return;
            timer = setTimeout(async () => {
                await sweep();
                schedule();
            }, hours * 3600_000);
            timer.unref?.();
        };
        schedule();
        return () => {
            disposed = true;
            if (timer)
                clearTimeout(timer);
        };
    }, "dsh-web-tools: platform session keep-alive");
    // ---- Search Mode (per-session "required web search" turn policy) ---------
    // Host-owned state riding the provider seam: `available()` means the search
    // provider service is enabled with a chain provider. Messages use the
    // OFFICIAL @deepseek-ai/dsh-llm createUserMessage ({ content, source }):
    // required = durable snapshot section, correction = one-shot notice.
    const searchModeMessages = createSearchModeMessages((input) => createUserMessage(input), () => {
        // The platform-routing lines only make sense while a platform source can
        // actually serve a routed query; otherwise the model is taught a prefix
        // that silently does nothing.
        const cfg = readConfig();
        const platforms = cfg.platformEnabled ?? {};
        return platforms.xiaohongshu !== false || platforms.x !== false;
    });
    const searchModeRuntime = new SearchModeRuntime(() => routedSearchProvider.available());
    ctx.effect(() => installSearchModeRuntime(ctx, { searchAvailable: () => routedSearchProvider.available() }, searchModeRuntime, searchModeMessages), "dsh-web-tools: search-mode runtime");
    // The routes expose the same runtime map to the button / slash commands.
    const searchMode = {
        view: (sessionId) => searchModeRuntime.view(sessionId),
        set: (sessionId, mode) => {
            searchModeRuntime.setMode(sessionId, mode);
            return searchModeRuntime.view(sessionId);
        },
    };
    // ---- Issue #9: custom source lifecycle helpers --------------------------
    /**
     * Publish operator outbound-authorization entries into the shared network
     * gate. Called on boot and after every config write, so authorization edits
     * apply live.
     */
    function syncGlobalOutboundAuthorizations() {
        const cfg = readConfig();
        setGlobalOutboundAuthorizations(Array.isArray(cfg.outboundAuthorizations) ? cfg.outboundAuthorizations : []);
    }
    /**
     * Drop runtime state for ONE source.
     *
     * Scoped to a single source on purpose: clearing every cooldown on an edit
     * would discard still-valid state for unrelated sources (an unrelated
     * provider's active 429 backoff would be forgotten and re-hit immediately).
     */
    function forgetSource(sourceId) {
        healthStore.deleteCooldown(sourceId);
        poolStore.forget(sourceId);
        generalSearchProvider.clear();
        generalFetchProvider.clear();
    }
    /** Remove every credential ref a deleted source owned. */
    async function revokeSourceCredentials(sourceId) {
        const removed = [];
        const failed = [];
        for (const ref of allCredentialRefsOf(sourceId)) {
            try {
                const cred = await readCredential(ctx, ref);
                if (!cred.configured)
                    continue;
                await writeCredential(ctx, ref, "");
                removed.push(ref);
            }
            catch {
                failed.push(ref);
            }
        }
        return { removed, failed };
    }
    /**
     * Run a bounded search through a custom source WITHOUT touching live state.
     *
     * Used by `sources/test` for both saved sources and unsaved drafts. It never
     * consults or mutates the shared pool or health store, so a failed probe of a
     * draft cannot mark a real provider's key unhealthy or start a cooldown.
     */
    async function testSource(input) {
        const TEST_TIMEOUT_MS = 15_000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error("test timed out")), TEST_TIMEOUT_MS);
        timer.unref?.();
        try {
            let config;
            if (input.draft !== undefined && input.draft !== null) {
                // If a draft is supplied, always test the current draft configuration.
                // If an existing sourceId is also present, retain that sourceId.
                const draft = validateDraft(input.draft);
                const id = input.sourceId ?? `custom_${"0".repeat(16)}`;
                config = { schemaVersion: 1, id, revision: 1, ...draft };
            }
            else if (input.sourceId !== undefined) {
                const sourceId = validateSourceId(input.sourceId);
                const stored = loadCustomProviders(readConfig().customProviders).find((entry) => entry.id === sourceId);
                if (!stored)
                    return { ok: false, error: { code: "not-found", message: `Unknown custom source "${sourceId}"` } };
                config = stored;
            }
            else {
                return { ok: false, error: { code: "config", message: "draft or sourceId required" } };
            }
            const refs = credentialRefsOf(config.id, config.auth.mode);
            const credInput = input.credential;
            const credential = {
                read: async (ref) => {
                    if (credInput?.mode === "candidate") {
                        if (ref === refs.key && typeof credInput.value === "string")
                            return credInput.value;
                        if (ref === refs.username && typeof credInput.username === "string")
                            return credInput.username;
                        if (ref === refs.password && typeof credInput.password === "string")
                            return credInput.password;
                    }
                    // Stored mode or fallback:
                    if (input.sourceId !== undefined) {
                        return credentialSource.read(ref);
                    }
                    if (ref === refs.key && typeof credInput?.value === "string")
                        return credInput.value;
                    if (ref === refs.username && typeof credInput?.username === "string")
                        return credInput.username;
                    if (ref === refs.password && typeof credInput?.password === "string")
                        return credInput.password;
                    return "";
                },
            };
            const cfg = readConfig();
            const existingAuths = [
                ...OUTBOUND_AUTHORIZATIONS,
                ...(Array.isArray(cfg.outboundAuthorizations) ? cfg.outboundAuthorizations : []),
            ];
            const endpointUrl = new URL(config.endpoint.baseUrl);
            const endpointPort = endpointUrl.port
                ? Number(endpointUrl.port)
                : (endpointUrl.protocol === "https:" ? 443 : 80);
            const isPrivateOrLoopback = isLocalOrPrivateHost(endpointUrl.hostname) ||
                (await resolvesToPrivateIp(endpointUrl.hostname));
            const isHttp = endpointUrl.protocol === "http:";
            const isAlreadyAuthorized = existingAuths.some((a) => (a.host.toLowerCase() === endpointUrl.hostname.toLowerCase() ||
                (a.host.startsWith(".") && endpointUrl.hostname.toLowerCase().endsWith(a.host.toLowerCase()))) &&
                (a.port === undefined || a.port === endpointPort) &&
                (!isPrivateOrLoopback || a.allowPrivate) &&
                (!isHttp || a.allowHttp));
            const candidateAuth = [];
            if ((isPrivateOrLoopback || isHttp) && !isAlreadyAuthorized) {
                if (input.confirmTarget !== true) {
                    const targetStr = `${endpointUrl.hostname}:${endpointPort}`;
                    return {
                        ok: false,
                        error: {
                            code: "conflict",
                            message: `此搜索服务位于本地网络或使用未加密 HTTP 连接。是否允许访问 ${targetStr}？若配置了 API Key，对应凭证将发送给该服务。`,
                        },
                    };
                }
                candidateAuth.push({
                    host: endpointUrl.hostname,
                    port: endpointPort,
                    allowPrivate: isPrivateOrLoopback,
                    allowHttp: isHttp,
                    allowProxy: !isPrivateOrLoopback,
                    sourceId: input.sourceId,
                    managedBy: "custom-source",
                    note: `Operator-confirmed: ${config.name}`,
                });
            }
            const authorizations = [...existingAuths, ...candidateAuth];
            const { policy, trust } = policyForCustomSource(config, authorizations);
            const adapter = createCustomAdapter(config, {
                transport: secureTransport,
                credentials: credential,
                refs,
                policy,
                trust,
            });
            const started = Date.now();
            try {
                const outcome = await adapter.search(input.query, 3, "", undefined, { signal: controller.signal });
                return {
                    ok: true,
                    status: "connected",
                    latencyMs: Date.now() - started,
                    resultCount: outcome.sources.length,
                    results: outcome.sources.slice(0, 3).map((s) => ({
                        title: s.title ?? s.url,
                        url: s.url,
                        ...(s.snippet ? { snippet: s.snippet } : {}),
                    })),
                };
            }
            catch (err) {
                if (err instanceof TransportError &&
                    err.code === "destination-blocked" &&
                    err.message.includes("private, loopback, or link-local") &&
                    input.confirmTarget !== true) {
                    const targetStr = `${endpointUrl.hostname}:${endpointPort}`;
                    return {
                        ok: false,
                        latencyMs: Date.now() - started,
                        error: {
                            code: "conflict",
                            message: `此搜索服务位于本地网络或解析到内网私有地址。是否允许访问 ${targetStr}？若配置了 API Key，对应凭证将发送给该服务。`,
                        },
                    };
                }
                const classified = toProviderError(err);
                return {
                    ok: false,
                    latencyMs: Date.now() - started,
                    error: {
                        code: mapProviderErrorToSourceCode(classified.code),
                        // The message is built by our own adapters from a label + status;
                        // upstream response bodies, headers and credentials are never
                        // included, so nothing sensitive can reach the browser here.
                        message: classified.message,
                    },
                };
            }
        }
        catch (err) {
            if (err instanceof CustomProviderValidationError) {
                return { ok: false, error: { code: "config", message: err.message } };
            }
            return {
                ok: false,
                error: { code: "config", message: err instanceof Error ? err.message : String(err) },
            };
        }
        finally {
            clearTimeout(timer);
        }
    }
    // ---- fenced HTTP routes for the card ------------------------------------
    ctx.effect(() => registerRoutes(ctx, {
        readConfig: () => readConfig(),
        writeConfig: async (patch) => {
            await configHandle.write(patch);
            // Publish the (possibly updated) operator outbound-authorization list
            // to the shared network gate immediately, so a just-saved intranet
            // gateway starts working without a plugin reload.
            syncGlobalOutboundAuthorizations();
        },
        readCredential: (ref) => readCredential(ctx, ref),
        writeCredential: async (ref, value) => {
            await writeCredential(ctx, ref, value);
            generalSearchProvider.clear();
            generalFetchProvider.clear();
        },
        testProviderSearch,
        testFullSearch,
        describeQuotas,
        nativeRuntime,
        sourceRegistry,
        checkVersion,
        poolEntries: (providerName) => poolStore.poolOf(providerName),
        proxyStatus,
        searchMode,
        sourceRefs: sourceRefsOf,
        testSource,
        revokeSourceCredentials: (sourceId) => revokeSourceCredentials(sourceId),
        forgetSource: (sourceId) => forgetSource(sourceId),
    }), "dsh-web-tools: /web-tools/api routes");
}
/**
 * Translate the executor's error vocabulary into the stable, UI-facing source
 * codes the editor switches on. Kept as an explicit mapping so adding a new
 * provider code forces a decision here instead of silently becoming "network".
 */
function mapProviderErrorToSourceCode(code) {
    switch (code) {
        case "auth":
            return "auth";
        case "timeout":
            return "timeout";
        case "invalid-response":
            return "invalid-response";
        case "config":
            return "config";
        case "bad-request":
            return "invalid-url";
        case "aborted":
            return "timeout";
        default:
            return "network";
    }
}
function toProviderError(error) {
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
        return error;
    }
    const message = describeFetchError(error);
    const err = new Error(message);
    err.code = "network";
    return err;
}
/**
 * Human-readable network failure. undici's global fetch throws a generic
 * `TypeError: fetch failed` whose real cause (ECONNREFUSED, DNS, TLS,
 * timeout, proxy refusal) sits in `error.cause` — surface it so the settings
 * card shows why a provider is unreachable instead of the bare wrapper.
 */
function describeFetchError(error) {
    const top = error instanceof Error ? error.message : String(error);
    let cause = error?.cause;
    const seen = new Set([error]);
    while (cause !== undefined && cause !== null && !seen.has(cause)) {
        seen.add(cause);
        if (cause instanceof AggregateError) {
            const first = cause.errors?.[0];
            if (first instanceof Error && first.message && !seen.has(first)) {
                cause = first;
                continue;
            }
        }
        const msg = cause instanceof Error ? cause.message : String(cause);
        if (msg && msg !== top)
            return `${top}: ${msg}`;
        cause = cause?.cause;
    }
    return top;
}
/** Simple timeout wrapper for side-channel quota lookups (no abort needed). */
function withTimeoutMs(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
            // Never keep the process alive just for an expired quota timer.
            timer.unref?.();
        }),
    ]);
}
export { PROVIDER_ID };
