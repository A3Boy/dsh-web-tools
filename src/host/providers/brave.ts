/**
 * dsh-web-tools — Brave Search provider adapter.
 *
 * API: POST https://api.search.brave.com/res/v1/web/search
 * Auth: X-Subscription-Token header.
 * Quota: the response headers carry the monthly request budget
 *   (X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset) — there is
 *   no separate balance endpoint, so quota is captured per search response.
 * @module
 */
import { providerError, throwIfHttp, type ProviderAdapter, type SearchOutcome } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

export const BRAVE_META = {
  name: "brave",
  label: "Brave",
  description: "Independent search index",
  credSuffix: "BRAVE",
  fetchCapable: false,
  needsBaseUrl: false,
} as const;

export const BraveProvider: ProviderAdapter = {
  ...BRAVE_META,

  async search(query, maxResults, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "Brave API key is not configured");
    const url = new URL(BRAVE_SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(maxResults));
    const res = await fetchWithProxy(url, {
      headers: { "x-subscription-token": apiKey, accept: "application/json" },
      signal,
    });
    throwIfHttp("Brave", res);
    // Capture the rate-limit headers per KEY on every successful search — no
    // extra request; quota/describe reads the snapshot for the current key.
    lastKnownQuotaByKey.set(apiKey, braveQuotaFromHeaders(res.headers));
    const raw = await res.json();
    const results = Array.isArray(raw?.web?.results) ? raw.web.results : [];
    const sources = results
      .map((r: Record<string, unknown>) => {
        const u = typeof r?.url === "string" ? r.url : "";
        if (!u) return null;
        const s: { url: string; title?: string; snippet?: string; publishedAt?: string } = { url: u };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        if (typeof r.description === "string" && r.description) s.snippet = r.description;
        if (typeof r.age === "string" && r.age) s.publishedAt = r.age;
        return s;
      })
      .filter((x: { url: string } | null): x is { url: string } => x !== null);
    return { sources };
  },

  async fetch(_url, _apiKey, _baseUrl, _signal) {
    throw providerError("config", "Brave does not provide native fetch");
  },
};

/** Last-known Brave quota snapshots, keyed by API key. */
const lastKnownQuotaByKey = new Map<string, QuotaSnapshot>();

/** Quota for the settings card: last-known snapshot for the given key. */
export async function braveQuota(apiKey: string, _baseUrl?: string, _signal?: AbortSignal): Promise<QuotaSnapshot> {
  return lastKnownQuotaByKey.get(apiKey) ?? {
    supported: false,
    authoritative: false,
    unit: "requests",
    source: "dashboard",
    fetchedAt: Date.now(),
    note: "Run a search first — Brave reports quota in search response headers",
  };
}

/** Parse Brave quota from the search response headers (monthly window). */
export function braveQuotaFromHeaders(headers: Headers, fetchedAt = Date.now()): QuotaSnapshot {
  const limitRaw = headers.get("x-ratelimit-limit");
  const remainingRaw = headers.get("x-ratelimit-remaining");
  // Brave sends comma-separated "per-second, per-month" values.
  const monthlyLimit = parseBravePair(limitRaw);
  const monthlyRemaining = parseBravePair(remainingRaw);
  return {
    supported: true,
    authoritative: true,
    unit: "requests",
    ...(monthlyRemaining !== undefined ? { remaining: monthlyRemaining } : {}),
    ...(monthlyLimit !== undefined ? { limit: monthlyLimit } : {}),
    source: "response_header",
    fetchedAt,
    note: "From Brave rate-limit response headers",
  };
}

/** Take the second (monthly) value of a "sec, month" header pair. */
function parseBravePair(value: string | null): number | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => Number(s.trim()));
  const monthly = parts[1] ?? parts[0];
  return Number.isFinite(monthly) ? monthly : undefined;
}
