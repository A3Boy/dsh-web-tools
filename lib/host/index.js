import { Config as PluginConfig, installConfig } from "./config.js";
import { createSearchProvider, createFetchProvider, createPoolStore, PROVIDER_ID } from "./registry.js";
import { registerRoutes } from "./routes.js";
import { Stats } from "./stats.js";
import { buildPool, selectIndex, markUsed, markUnhealthy } from "./pool.js";
import { credRefOf, getProvider, PROVIDER_LIST, quotaOf } from "./providers/index.js";
import { isKeylessSelfHosted } from "./providers/types.js";
import { mergePoolQuota } from "./quota.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = "dsh-web-tools";
/** Services required by this plugin. */
export const inject = ["webServer", "webRuntime", "settings", "credentials", "web"];
/**
 * Plugin-level config: the same schemastery schema as the settings namespace.
 * Cordis requires `Config` to be a schema instance (it calls `.validate` when
 * resolving plugin config); an empty object would crash at load.
 */
export const Config = PluginConfig;
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
export function apply(ctx) {
    const stats = new Stats();
    const configHandle = installConfig(ctx);
    const readConfig = () => configHandle.read();
    // ---- ctx.web search + fetch providers ----------------------------------
    const resolveRuntimeConfig = () => {
        const cfg = readConfig();
        return {
            enabled: cfg.enabled !== false,
            defaultProvider: cfg.defaultProvider,
            providerAttemptTimeoutMs: cfg.providerAttemptTimeoutMs,
            fallbackOrder: cfg.fallbackOrder,
            providerBaseUrls: cfg.providerBaseUrls,
            enabledProviders: cfg.providerEnabled,
        };
    };
    const resolveKeys = async (providerName) => {
        const ref = credRefOf(providerName);
        const cred = await readCredential(ctx, ref);
        return cred.value ?? "";
    };
    // ONE shared pool store for search + fetch: they see the same key usage
    // and health, and rebuild only when a credential actually changes.
    const poolStore = createPoolStore(resolveKeys);
    const provider = createSearchProvider(resolveRuntimeConfig, resolveKeys, {
        record: (e) => stats.record({ ...e, at: Date.now() }),
    }, undefined, poolStore);
    ctx.web.registerSearchProvider(provider);
    const fetchProvider = createFetchProvider(resolveRuntimeConfig, resolveKeys, undefined, poolStore);
    ctx.web.registerFetchProvider(fetchProvider);
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
                const index = selectIndex(entries);
                const entry = entries[index];
                key = entry?.key ?? "";
                try {
                    const outcome = await adapter.search(query, 1, key, readConfig().providerBaseUrls[providerName]);
                    markUsed(entries, index);
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
            const result = await provider.search({ query, maxResults: 5 }, undefined);
            return {
                ok: true,
                backend: result.backend,
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
    /** Quota snapshots for every provider (authoritative where available). */
    /** Quota cache: { fetchedAt, per provider snapshot }. */
    let quotaCache = null;
    const QUOTA_CACHE_MS = 5 * 60 * 1000; // 5 min — quota is display-only, no 30s polling
    const QUOTA_TIMEOUT_MS = 8000;
    async function describeQuotas(force = false) {
        if (!force && quotaCache && Date.now() - quotaCache.fetchedAt < QUOTA_CACHE_MS)
            return quotaCache.quotas;
        const cfg = readConfig();
        const enabledNames = new Set([cfg.defaultProvider, ...cfg.fallbackOrder]);
        const summary = stats.summary();
        // Parallel, timeout-bounded, only providers actually in the search chain.
        const results = await Promise.allSettled(PROVIDER_LIST.filter((meta) => enabledNames.has(meta.name)).map(async (meta) => {
            const ref = credRefOf(meta.name);
            const cred = await readCredential(ctx, ref);
            const localSearches = summary.byProvider[meta.name]?.success ?? 0;
            const localUsdCents = localSearches > 0 ? Math.max(1, Math.round((localSearches * 700) / 1000)) : undefined;
            // Multi-key pool: query EVERY key and merge — the card shows the
            // TOTAL pool balance, not one key's. Each key is authenticated
            // separately (never join the raw string).
            const keys = buildPool(cred.value ?? "").map((e) => e.key);
            if (keys.length === 0) {
                const snapshot = await withTimeoutMs(quotaOf(meta.name, "", cfg.providerBaseUrls[meta.name], localUsdCents), QUOTA_TIMEOUT_MS);
                return [meta.name, snapshot];
            }
            const perKey = await Promise.allSettled(keys.map((k) => withTimeoutMs(quotaOf(meta.name, k, cfg.providerBaseUrls[meta.name], localUsdCents), QUOTA_TIMEOUT_MS)));
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
    // ---- fenced HTTP routes for the card ------------------------------------
    ctx.effect(() => registerRoutes(ctx, {
        readConfig: () => readConfig(),
        writeConfig: (patch) => configHandle.write(patch),
        readCredential: (ref) => readCredential(ctx, ref),
        writeCredential: (ref, value) => writeCredential(ctx, ref, value),
        testProviderSearch,
        testFullSearch,
        describeQuotas,
        poolEntries: (providerName) => poolStore.poolOf(providerName),
    }), "dsh-web-tools: /web-tools/api routes");
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
