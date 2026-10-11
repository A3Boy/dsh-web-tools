/**
 * dsh-web-tools — Built-in provider endpoint table + override resolution.
 *
 * ## Why joins are explicit
 *
 * `new URL("/search", "https://gw.example.com/v2")` yields
 * `https://gw.example.com/search` — the `/v2` prefix is silently DROPPED,
 * because a root-relative reference replaces the whole path. Gateway deploys
 * (and Firecrawl's own `/v2` base) then 404. {@link joinUrl} strips leading
 * slashes from the relative part and appends, so a configured prefix survives.
 *
 * ## Three-state override
 *
 * | state          | stored              | effective        |
 * |----------------|---------------------|------------------|
 * | untouched      | nothing             | official default |
 * | overridden     | only the override   | the override     |
 * | reset          | override deleted    | official default |
 *
 * @module
 */
/** Official endpoints per built-in provider. */
export const PROVIDER_ENDPOINTS = {
    tavily: {
        search: { url: "https://api.tavily.com/search", host: "api.tavily.com", overridable: true },
        extra: {
            extract: { url: "https://api.tavily.com/extract", host: "api.tavily.com", overridable: false },
            usage: { url: "https://api.tavily.com/usage", host: "api.tavily.com", overridable: false },
        },
    },
    exa: {
        search: { url: "https://api.exa.ai/search", host: "api.exa.ai", overridable: true },
        extra: { contents: { url: "https://api.exa.ai/contents", host: "api.exa.ai", overridable: false } },
    },
    firecrawl: {
        search: { url: "https://api.firecrawl.dev/v2/search", host: "api.firecrawl.dev", overridable: true },
        extra: {
            scrape: { url: "https://api.firecrawl.dev/v2/scrape", host: "api.firecrawl.dev", overridable: false },
            creditUsage: { url: "https://api.firecrawl.dev/v2/team/credit-usage", host: "api.firecrawl.dev", overridable: false },
        },
    },
    parallel: {
        search: { url: "https://api.parallel.ai/v1/search", host: "api.parallel.ai", overridable: true },
        extra: { extract: { url: "https://api.parallel.ai/v1/extract", host: "api.parallel.ai", overridable: false } },
    },
    brave: {
        search: { url: "https://api.search.brave.com/res/v1/web/search", host: "api.search.brave.com", overridable: true },
        extra: { llmContext: { url: "https://api.search.brave.com/res/v1/llm/context", host: "api.search.brave.com", overridable: true } },
    },
    you: {
        search: { url: "https://ydc-index.io/v1/search", host: "ydc-index.io", overridable: true },
        extra: {
            contents: { url: "https://ydc-index.io/v1/contents", host: "ydc-index.io", overridable: false },
            balance: { url: "https://api.you.com/v1/billing/account_balance", host: "api.you.com", overridable: false },
        },
    },
    jina: {
        search: { url: "https://s.jina.ai/", host: "s.jina.ai", overridable: true },
        extra: { reader: { url: "https://r.jina.ai/", host: "r.jina.ai", overridable: false } },
    },
    searxng: {
        search: { url: "http://127.0.0.1:8080/search", host: "127.0.0.1", overridable: true },
    },
};
/**
 * Providers whose default endpoint is intentionally loopback (self-hosted).
 * The outbound policy treats an *unmodified* default as operator-trusted —
 * a locally installed SearXNG is the normal case — while an operator-typed
 * private address still needs explicit authorization.
 */
export const SELF_HOSTED_PROVIDERS = new Set(["searxng"]);
/**
 * Join a base URL with a relative path, preserving any base path prefix.
 *
 * @param baseUrl absolute base, with or without a path prefix.
 * @param relative path such as `/search` or `search`.
 * @throws {Error} when either side is empty or the relative part is absolute.
 */
export function joinUrl(baseUrl, relative) {
    const base = baseUrl.trim();
    if (!base)
        throw new Error("joinUrl: base URL is required");
    if (!relative)
        return stripTrailingSlash(base);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(relative) || relative.startsWith("//")) {
        throw new Error(`joinUrl: relative path must not be an absolute URL ("${relative}")`);
    }
    return `${stripTrailingSlash(base)}/${relative.replace(/^\/+/, "")}`;
}
/** Remove trailing slashes (but never the whole string). */
export function stripTrailingSlash(value) {
    const trimmed = value.trim();
    return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}
/**
 * The origin (scheme://host[:port]) of a base URL. Used for the outbound
 * policy's host comparison so a path prefix never weakens the check.
 */
export function originOf(baseUrl) {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}`;
}
/**
 * The base URL a provider should use, from the persisted override map.
 *
 * An empty or whitespace-only override means "not overridden" — that is how
 * the UI's "restore default" action clears the entry.
 */
export function resolveBaseUrl(providerName, overrides, endpointKey = "search") {
    const table = PROVIDER_ENDPOINTS[providerName];
    const official = table?.extra?.[endpointKey] ?? table?.search;
    if (!official)
        return undefined;
    const defaultBase = baseUrlOf(official.url);
    const rawOverride = overrides?.[providerName];
    const override = typeof rawOverride === "string" && rawOverride.trim().length > 0 ? stripTrailingSlash(rawOverride) : null;
    return override ?? defaultBase;
}
/** The base URL portion of a full endpoint URL (for override defaults). */
export function baseUrlOf(endpointUrl) {
    const u = new URL(endpointUrl);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.origin}${path}`;
}
/**
 * Full endpoint resolution for one provider.
 *
 * Accepts the persisted override map (the shape settings stores) and extracts
 * this provider's entry, so callers inside an adapter — which receive only
 * their own `baseUrl` — can build a one-entry map without a cast.
 *
 * @param providerName built-in id, e.g. `"tavily"`.
 * @param overrides persisted `providerBaseUrls`.
 * @param endpointKey which endpoint to resolve (default `"search"`).
 */
export function endpointViewOf(providerName, overrides, endpointKey = "search") {
    const table = PROVIDER_ENDPOINTS[providerName];
    const official = table?.extra?.[endpointKey] ?? table?.search;
    if (!official)
        return undefined;
    const defaultBaseUrl = baseUrlOf(official.url);
    const rawOverride = overrides?.[providerName];
    const baseUrlOverride = typeof rawOverride === "string" && rawOverride.trim().length > 0 ? stripTrailingSlash(rawOverride) : null;
    // Reset means "delete the override" → the official URL returns verbatim, so
    // the exact official string (including any trailing slash) is preserved.
    const effectiveBaseUrl = baseUrlOverride ?? defaultBaseUrl;
    const relative = relativePathOf(official.url, defaultBaseUrl);
    return {
        defaultBaseUrl,
        baseUrlOverride,
        effectiveBaseUrl,
        isOverridden: baseUrlOverride !== null,
        url: baseUrlOverride ? joinUrl(baseUrlOverride, relative) : official.url,
    };
}
/** The path of an official endpoint relative to its own base URL. */
function relativePathOf(endpointUrl, baseUrl) {
    const full = new URL(endpointUrl);
    const base = new URL(baseUrl);
    const path = full.pathname.startsWith(base.pathname) ? full.pathname.slice(base.pathname.length) : full.pathname;
    return path.replace(/^\/+/, "");
}
/**
 * Whether an override target is the same origin as the official endpoint.
 * When it is not, the operator is about to send an existing credential to a
 * different service and must confirm.
 */
export function isForeignOverride(providerName, overrideBaseUrl, endpointKey = "search") {
    const table = PROVIDER_ENDPOINTS[providerName];
    const official = table?.extra?.[endpointKey] ?? table?.search;
    if (!official)
        return false;
    try {
        const overrideHostname = new URL(overrideBaseUrl).hostname.toLowerCase();
        const officialHostname = official.host.split(":")[0].toLowerCase();
        return overrideHostname !== officialHostname;
    }
    catch {
        return true;
    }
}
