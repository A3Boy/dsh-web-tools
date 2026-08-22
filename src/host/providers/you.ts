import { providerError, throwIfHttp, classifyHttpStatus, resolveContext, type ProviderAdapter, type SearchOutcome } from "./types.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
import type { QuotaSnapshot } from "../quota.ts";
import type { YouProviderOptions } from "../../shared/provider-options.ts";

const YOU_SEARCH_URL = "https://ydc-index.io/v1/search";
const YOU_CONTENTS_URL = "https://ydc-index.io/v1/contents";
const YOU_BALANCE_URL = "https://api.you.com/v1/billing/account_balance";

export const YOU_META = {
  name: "you",
  label: "You.com",
  description: "AI search with USD credit balance",
  credSuffix: "YOU",
  fetchCapable: true,
  needsBaseUrl: false,
};

/** Official You.com auth header (X-API-Key, per the API reference). */
function youAuthHeader(apiKey: string): Record<string, string> {
  const token = (apiKey ?? "").trim();
  return { "x-api-key": token };
}

/** Error handler that highlights missing product scope for 403. */
function throwYouError(res: Response): never {
  if (res.status === 403) {
    throw providerError("auth", "You.com returned 403: Forbidden (check API key permissions and product scopes)", 403);
  }
  // Only called when !res.ok, so this always throws.
  throwIfHttp("You.com", res);
  throw new Error("unreachable");
}

export const YouProvider: ProviderAdapter = {
  ...YOU_META,

  async search(query, maxResults, apiKey, _baseUrl, contextOrSignal) {
    if (!apiKey) throw providerError("config", "You.com API key is not configured");
    const { signal, options } = resolveContext<YouProviderOptions>(contextOrSignal);

    const body: Record<string, unknown> = {
      query,
      count: maxResults,
    };
    if (options?.extractionMode !== "none") {
      body.extraction = { extraction_mode: "highlights" };
    }

    const res = await fetchWithProxy(YOU_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...youAuthHeader(apiKey) },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throwYouError(res);
    const raw = await res.json();
    // POST /v1/search → { results: { web: [...], news: [...] } }
    const webResults = Array.isArray(raw?.results?.web) ? raw.results.web : [];
    const newsResults = Array.isArray(raw?.results?.news) ? raw.results.news : [];
    const legacyHits = Array.isArray(raw?.hits) ? raw.hits : [];
    const results = [...webResults, ...newsResults, ...legacyHits];
    const sources = results
      .map((r: Record<string, unknown>) => {
        const u = typeof r?.url === "string" ? r.url : "";
        if (!u) return null;
        const s: { url: string; title?: string; snippet?: string; publishedAt?: string } = { url: u };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        // Priority: contents.highlights (query-relevant excerpts) > snippets[0] > description
        const contents = r.contents as { highlights?: unknown } | undefined;
        let snippet: string | undefined;
        if (Array.isArray(contents?.highlights) && contents.highlights.length > 0) {
          const joined = contents.highlights
            .filter((h): h is string => typeof h === "string")
            .join("\n\n")
            .trim();
          if (joined) snippet = joined.length > 1200 ? joined.slice(0, 1200) + "…" : joined;
        } else if (Array.isArray(r.snippets) && typeof r.snippets[0] === "string") {
          snippet = r.snippets[0];
        } else if (typeof r.description === "string") {
          snippet = r.description;
        }
        if (snippet) s.snippet = snippet;
        if (typeof r.page_age === "string" && r.page_age) s.publishedAt = r.page_age;
        return s;
      })
      .filter((x: { url: string } | null): x is { url: string } => x !== null);
    return { sources };
  },

  async fetch(url, apiKey, _baseUrl, contextOrSignal) {
    if (!apiKey) throw providerError("config", "You.com API key is not configured");
    const { signal, options } = resolveContext<YouProviderOptions>(contextOrSignal);

    const body: Record<string, unknown> = {
      urls: [url],
      formats: ["markdown"],
    };
    if (typeof options?.fetchCrawlTimeoutSec === "number") {
      body.crawl_timeout = options.fetchCrawlTimeoutSec;
    }
    if (typeof options?.fetchMaxAgeSec === "number") {
      body.max_age = options.fetchMaxAgeSec;
    }

    // POST /v1/contents returns full Markdown for specified URLs.
    const res = await fetchWithProxy(YOU_CONTENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...youAuthHeader(apiKey) },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throwYouError(res);
    const data = await res.json();
    // /contents returns an array of result objects: [{ url, title, markdown }]
    const item = Array.isArray(data) ? data[0] : (data?.results?.[0] ?? data);
    const text = typeof item?.markdown === "string" ? item.markdown : typeof item?.text === "string" ? item.text : "";
    if (!text) throw providerError("server", `You.com returned no content for ${url}`);
    return { text };
  },
};

/** Snapshot provider for You.com. */
export async function youQuota(apiKey: string, _signal?: AbortSignal): Promise<QuotaSnapshot> {
  return pollYouQuota(apiKey);
}

export async function pollYouQuota(apiKey: string): Promise<QuotaSnapshot> {
  const fetchedAt = Date.now();
  const res = await fetchWithProxy(YOU_BALANCE_URL, {
    method: "GET",
    headers: youAuthHeader(apiKey),
  });
  if (!res.ok) {
    return {
      supported: true,
      authoritative: false,
      unit: "usd_cents",
      source: "api",
      fetchedAt,
      note: `HTTP ${res.status}`,
    };
  }
  const data = await res.json();
  const cents = typeof data?.data?.attributes?.balance === "number" ? data.data.attributes.balance : undefined;
  return {
    supported: true,
    authoritative: cents !== undefined,
    unit: "usd_cents",
    remaining: cents,
    source: "api",
    fetchedAt,
  };
}
