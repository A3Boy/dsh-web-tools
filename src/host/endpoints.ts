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

/** One endpoint of one provider. */
export interface ProviderEndpoint {
  /** Default base URL, e.g. "https://api.tavily.com" or "https://api.firecrawl.dev/v2" */
  defaultBaseUrl: string;
  /** Relative endpoint path, e.g. "/search" or "/res/v1/web/search" */
  path: string;
  /** Absolute official URL, including any version prefix. */
  url: string;
  /** Host the official credential is safe to send to. */
  host: string;
  /**
   * Whether the base-URL override applies to this endpoint. Only the SEARCH
   * endpoint is overridable by default: a gateway that proxies search may not
   * proxy extract/scrape/balance, and silently sending a credential to a
   * different host for those is a credential-leak vector.
   */
  overridable: boolean;
}

/** Official endpoints per built-in provider. */
export const PROVIDER_ENDPOINTS: Record<string, { search: ProviderEndpoint; extra?: Record<string, ProviderEndpoint> }> = {
  tavily: {
    search: { defaultBaseUrl: "https://api.tavily.com", path: "/search", url: "https://api.tavily.com/search", host: "api.tavily.com", overridable: true },
    extra: {
      extract: { defaultBaseUrl: "https://api.tavily.com", path: "/extract", url: "https://api.tavily.com/extract", host: "api.tavily.com", overridable: false },
      usage: { defaultBaseUrl: "https://api.tavily.com", path: "/usage", url: "https://api.tavily.com/usage", host: "api.tavily.com", overridable: false },
    },
  },
  exa: {
    search: { defaultBaseUrl: "https://api.exa.ai", path: "/search", url: "https://api.exa.ai/search", host: "api.exa.ai", overridable: true },
    extra: { contents: { defaultBaseUrl: "https://api.exa.ai", path: "/contents", url: "https://api.exa.ai/contents", host: "api.exa.ai", overridable: false } },
  },
  firecrawl: {
    search: { defaultBaseUrl: "https://api.firecrawl.dev/v2", path: "/search", url: "https://api.firecrawl.dev/v2/search", host: "api.firecrawl.dev", overridable: true },
    extra: {
      scrape: { defaultBaseUrl: "https://api.firecrawl.dev/v2", path: "/scrape", url: "https://api.firecrawl.dev/v2/scrape", host: "api.firecrawl.dev", overridable: false },
      creditUsage: { defaultBaseUrl: "https://api.firecrawl.dev/v2", path: "/team/credit-usage", url: "https://api.firecrawl.dev/v2/team/credit-usage", host: "api.firecrawl.dev", overridable: false },
    },
  },
  parallel: {
    search: { defaultBaseUrl: "https://api.parallel.ai/v1", path: "/search", url: "https://api.parallel.ai/v1/search", host: "api.parallel.ai", overridable: true },
    extra: { extract: { defaultBaseUrl: "https://api.parallel.ai/v1", path: "/extract", url: "https://api.parallel.ai/v1/extract", host: "api.parallel.ai", overridable: false } },
  },
  brave: {
    search: { defaultBaseUrl: "https://api.search.brave.com", path: "/res/v1/web/search", url: "https://api.search.brave.com/res/v1/web/search", host: "api.search.brave.com", overridable: true },
    extra: { llmContext: { defaultBaseUrl: "https://api.search.brave.com", path: "/res/v1/llm/context", url: "https://api.search.brave.com/res/v1/llm/context", host: "api.search.brave.com", overridable: true } },
  },
  you: {
    search: { defaultBaseUrl: "https://ydc-index.io/v1", path: "/search", url: "https://ydc-index.io/v1/search", host: "ydc-index.io", overridable: true },
    extra: {
      contents: { defaultBaseUrl: "https://ydc-index.io/v1", path: "/contents", url: "https://ydc-index.io/v1/contents", host: "ydc-index.io", overridable: false },
      balance: { defaultBaseUrl: "https://api.you.com/v1", path: "/billing/account_balance", url: "https://api.you.com/v1/billing/account_balance", host: "api.you.com", overridable: false },
    },
  },
  jina: {
    search: { defaultBaseUrl: "https://s.jina.ai", path: "/", url: "https://s.jina.ai/", host: "s.jina.ai", overridable: true },
    extra: { reader: { defaultBaseUrl: "https://r.jina.ai", path: "/", url: "https://r.jina.ai/", host: "r.jina.ai", overridable: false } },
  },
  searxng: {
    search: { defaultBaseUrl: "http://127.0.0.1:8080", path: "/search", url: "http://127.0.0.1:8080/search", host: "127.0.0.1", overridable: true },
  },
};

/**
 * Providers whose default endpoint is intentionally loopback (self-hosted).
 * The outbound policy treats an *unmodified* default as operator-trusted —
 * a locally installed SearXNG is the normal case — while an operator-typed
 * private address still needs explicit authorization.
 */
export const SELF_HOSTED_PROVIDERS = new Set(["searxng"]);

/** Resolved view of one endpoint: default, override and the effective URL. */
export interface EndpointView {
  defaultBaseUrl: string;
  baseUrlOverride: string | null;
  effectiveBaseUrl: string;
  isOverridden: boolean;
  /** Full URL of the requested endpoint (prefix-preserving). */
  url: string;
}

/**
 * Join a base URL with a relative path, preserving any base path prefix.
 *
 * @param baseUrl absolute base, with or without a path prefix.
 * @param relative path such as `/search` or `search`.
 * @throws {Error} when either side is empty or the relative part is absolute.
 */
export function joinUrl(baseUrl: string, relative: string): string {
  const base = baseUrl.trim();
  if (!base) throw new Error("joinUrl: base URL is required");
  if (!relative || relative === "/") return stripTrailingSlash(base);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(relative) || relative.startsWith("//")) {
    throw new Error(`joinUrl: relative path must not be an absolute URL ("${relative}")`);
  }
  const cleanRelative = relative.replace(/^\/+/, "");
  const strippedBase = stripTrailingSlash(base);
  try {
    const parsedBase = new URL(strippedBase);
    const basePath = parsedBase.pathname.replace(/\/+$/, "").replace(/^\/+/, "");
    if (basePath === cleanRelative || basePath.endsWith("/" + cleanRelative)) {
      return strippedBase;
    }
  } catch {}
  return `${strippedBase}/${cleanRelative}`;
}

/** Remove trailing slashes (but never the whole string). */
export function stripTrailingSlash(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

/**
 * The origin (scheme://host[:port]) of a base URL. Used for the outbound
 * policy's host comparison so a path prefix never weakens the check.
 */
export function originOf(baseUrl: string): string {
  const u = new URL(baseUrl);
  return `${u.protocol}//${u.host}`;
}

/**
 * The base URL a provider should use, from the persisted override map.
 *
 * An empty or whitespace-only override means "not overridden" — that is how
 * the UI's "restore default" action clears the entry.
 */
export function resolveBaseUrl(
  providerName: string,
  overrides: Record<string, string> | undefined,
  endpointKey = "search",
): string | undefined {
  const table = PROVIDER_ENDPOINTS[providerName];
  const official = table?.extra?.[endpointKey] ?? table?.search;
  if (!official) return undefined;
  const defaultBase = baseUrlOf(official.url);
  const rawOverride = overrides?.[providerName];
  const override = typeof rawOverride === "string" && rawOverride.trim().length > 0 ? stripTrailingSlash(rawOverride) : null;
  return override ?? defaultBase;
}

/** The base URL portion of a full endpoint URL (for override defaults). */
export function baseUrlOf(endpointUrl: string): string {
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
export function endpointViewOf(
  providerName: string,
  overrides: Record<string, string | undefined> | undefined,
  endpointKey = "search",
): EndpointView | undefined {
  const table = PROVIDER_ENDPOINTS[providerName];
  const official = table?.extra?.[endpointKey] ?? table?.search;
  if (!official) return undefined;

  const defaultBaseUrl = official.defaultBaseUrl;
  const rawOverride = overrides?.[providerName];
  const baseUrlOverride =
    typeof rawOverride === "string" && rawOverride.trim().length > 0 ? stripTrailingSlash(rawOverride) : null;
  // Reset means "delete the override" → the official URL returns verbatim, so
  // the exact official string (including any trailing slash) is preserved.
  const effectiveBaseUrl = baseUrlOverride ?? defaultBaseUrl;
  return {
    defaultBaseUrl,
    baseUrlOverride,
    effectiveBaseUrl,
    isOverridden: baseUrlOverride !== null,
    url: baseUrlOverride ? joinUrl(baseUrlOverride, official.path) : official.url,
  };
}

/**
 * Whether an override target is the same origin as the official endpoint.
 * When it is not, the operator is about to send an existing credential to a
 * different service and must confirm.
 */
export function isForeignOverride(providerName: string, overrideBaseUrl: string, endpointKey = "search"): boolean {
  const table = PROVIDER_ENDPOINTS[providerName];
  const official = table?.extra?.[endpointKey] ?? table?.search;
  if (!official) return false;
  try {
    const overrideHostname = new URL(overrideBaseUrl).hostname.toLowerCase();
    const officialHostname = official.host.split(":")[0].toLowerCase();
    return overrideHostname !== officialHostname;
  } catch {
    return true;
  }
}
