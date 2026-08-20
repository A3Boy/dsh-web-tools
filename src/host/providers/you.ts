/**
 * dsh-web-tools — You.com provider adapter.
 *
 * API (2026-08, verified against the official You.com docs / SKILL):
 *   Search : POST https://api.you.com/v1/search
 *            X-API-Key: <apiKey>            (official header, see docs)
 *            body { query, num_web_results }
 *            → results.web[] (url/title/description/snippets/page_age)
 *   Balance: GET https://api.you.com/v1/billing/account_balance
 *            X-API-Key: <apiKey>
 *            → data.attributes.balance in USD cents (authoritative)
 *
 * The legacy POST /llm/search endpoint returns 404 — do not reintroduce it.
 * @module
 */
import { providerError, throwIfHttp, type ProviderAdapter, type SearchOutcome } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";

const YOU_SEARCH_URL = "https://api.you.com/v1/search";
const YOU_BALANCE_URL = "https://api.you.com/v1/billing/account_balance";

export const YOU_META = {
  name: "you",
  label: "You.com",
  description: "AI search with USD credit balance",
  credSuffix: "YOU",
  fetchCapable: false,
  needsBaseUrl: false,
} as const;

/** Official You.com auth header (X-API-Key, per the API reference). */
function youAuthHeader(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey };
}

export const YouProvider: ProviderAdapter = {
  ...YOU_META,

  async search(query, maxResults, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "You.com API key is not configured");
    // POST /v1/search with extraction.extraction_mode = "highlights" (added 2026-08-11).
    // Returns query-relevant passages in contents.highlights, sized for token-sensitive
    // agent workflows. Omits standard snippets in highlights mode.
    const res = await fetchWithProxy(YOU_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...youAuthHeader(apiKey) },
      body: JSON.stringify({
        query,
        count: maxResults,
        extraction: { extraction_mode: "highlights" },
      }),
      signal,
    });
    throwIfHttp("You.com", res);
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
          snippet = contents.highlights
            .filter((h): h is string => typeof h === "string")
            .join("\n\n")
            .slice(0, 1500);
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

  async fetch(_url, _apiKey, _baseUrl, _signal) {
    throw providerError("config", "You.com does not provide native fetch");
  },
};

/** You.com official account balance (USD cents, Bearer auth). */
export async function youQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot> {
  if (!apiKey) throw providerError("config", "You.com API key is not configured");
  const res = await fetchWithProxy(YOU_BALANCE_URL, {
    headers: youAuthHeader(apiKey),
    signal,
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw providerError("auth", `You.com balance auth failed (HTTP ${res.status})`, res.status);
    if (res.status === 429) throw providerError("rate-limit", "You.com rate limit exceeded (HTTP 429)", res.status);
    throw providerError("server", `You.com balance failed (HTTP ${res.status})`, res.status);
  }
  const raw = await res.json();
  const balanceCents = raw?.data?.attributes?.balance;
  return {
    supported: true,
    authoritative: true,
    unit: "usd_cents",
    ...(typeof balanceCents === "number" ? { remaining: balanceCents } : {}),
    source: "api",
    fetchedAt: Date.now(),
  };
}
