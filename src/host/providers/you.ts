/**
 * dsh-web-tools — You.com provider adapter.
 *
 * API: POST https://api.you.com/llm/search (X-API-Key header).
 * Balance: GET https://api.you.com/v1/billing/account_balance returns
 *   `data.attributes.balance` in USD cents — an official authoritative value.
 * @module
 */
import { providerError, type ProviderAdapter, type SearchOutcome } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";

const YOU_SEARCH_URL = "https://api.you.com/llm/search";
const YOU_BALANCE_URL = "https://api.you.com/v1/billing/account_balance";

export const YOU_META = {
  name: "you",
  label: "You.com",
  description: "AI search with USD credit balance",
  credSuffix: "YOU",
  fetchCapable: false,
  needsBaseUrl: false,
} as const;

export const YouProvider: ProviderAdapter = {
  ...YOU_META,

  async search(query, maxResults, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "You.com API key is not configured");
    const res = await fetch(YOU_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ query, num_web_results: maxResults }),
      signal,
    });
    throwIfHttp(res);
    const raw = await res.json();
    const results = Array.isArray(raw?.hits) ? raw.hits : [];
    const sources = results
      .map((r: Record<string, unknown>) => {
        const u = typeof r?.url === "string" ? r.url : "";
        if (!u) return null;
        const s: { url: string; title?: string; snippet?: string } = { url: u };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        if (typeof r.snippet === "string" && r.snippet) s.snippet = r.snippet;
        return s;
      })
      .filter((x: { url: string } | null): x is { url: string } => x !== null);
    return { sources };
  },

  async fetch(_url, _apiKey, _baseUrl, _signal) {
    throw providerError("config", "You.com does not provide native fetch");
  },
};

/** You.com official account balance (USD cents). */
export async function youQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot> {
  if (!apiKey) throw providerError("config", "You.com API key is not configured");
  const res = await fetch(YOU_BALANCE_URL, {
    headers: { "x-api-key": apiKey },
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

function throwIfHttp(res: Response) {
  if (res.ok) return;
  if (res.status === 401 || res.status === 403) throw providerError("auth", `You.com auth failed (HTTP ${res.status})`, res.status);
  if (res.status === 429) throw providerError("rate-limit", "You.com rate limit exceeded (HTTP 429)", res.status);
  if (res.status >= 500) throw providerError("server", `You.com server error (HTTP ${res.status})`, res.status);
  throw providerError("bad-request", `You.com request failed (HTTP ${res.status})`, res.status);
}
