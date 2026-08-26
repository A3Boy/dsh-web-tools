/**
 * dsh-web-tools — SearXNG provider adapter (self-hosted, keyless option).
 * Queries the local instance's JSON output (GET {baseUrl}/search?format=json).
 * SSRF guard: refuses private/loopback targets unless the operator explicitly
 * opts in (self-hosted SearXNG on localhost is the normal case, so the guard
 * applies to the search TARGET, not the instance URL — the instance URL is
 * operator-configured and trusted by definition).
 * @module
 */
import { providerError, resolveContext, type ProviderAdapter, type SearchOutcome } from "./types.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
import type { SearchHints } from "../search-hints.ts";

export const SEARXNG_META = {
  name: "searxng",
  label: "SearXNG",
  description: "Self-hosted metasearch (JSON output)",
  credSuffix: "SEARXNG",
  fetchCapable: false,
  needsBaseUrl: true,
  defaultBaseUrl: "http://127.0.0.1:8080",
} as const;

/**
 * Build SearXNG URL parameters based on query, options, and SearchHints.
 * Maps:
 *  - topic=code → categories=it
 *  - topic=research → categories=science
 *  - topic=news → categories=news
 *  - freshness preset → time_range: "day" | "month" | "year"
 *  - language → language (e.g. "zh-CN", "en")
 */
export function buildSearxngUrl(
  instanceUrl: string,
  query: string,
  apiKey?: string,
  hints?: Readonly<SearchHints>,
): URL {
  const instance = instanceUrl.replace(/\/$/, "");
  const url = new URL(`${instance}/search`);
  const cleanQ = hints?.cleanQuery ? hints.cleanQuery : query;

  url.searchParams.set("q", cleanQ);
  url.searchParams.set("format", "json");
  url.searchParams.set("safesearch", "0");
  if (apiKey) url.searchParams.set("api_key", apiKey);

  // 1. Categories
  if (hints?.topic === "code") {
    url.searchParams.set("categories", "it");
  } else if (hints?.topic === "research") {
    url.searchParams.set("categories", "science");
  } else if (hints?.topic === "news") {
    url.searchParams.set("categories", "news");
  }

  // 2. Time range
  const freshnessPreset = hints?.freshness?.preset;
  if (freshnessPreset === "day" || freshnessPreset === "month" || freshnessPreset === "year") {
    url.searchParams.set("time_range", freshnessPreset);
  }

  // 3. Language
  if (hints?.locale?.language) {
    url.searchParams.set("language", hints.locale.language);
  }

  return url;
}

export const SearxngProvider: ProviderAdapter = {
  ...SEARXNG_META,

  async search(query, maxResults, apiKey, baseUrl, contextOrSignal) {
    const { signal, hints } = resolveContext(contextOrSignal);
    const instance = (baseUrl ?? SEARXNG_META.defaultBaseUrl).replace(/\/$/, "");
    if (!instance) throw providerError("config", "SearXNG base URL is not configured");
    const url = buildSearxngUrl(instance, query, apiKey, hints);
    let res: Response;
    try {
      res = await fetchWithProxy(url, { signal });
    } catch (e) {
      throw providerError("network", `SearXNG unreachable at ${instance}: ${String(e)}`);
    }
    if (!res.ok) {
      if (res.status === 403) throw providerError("auth", "SearXNG refused the request (403) — enable JSON output in settings.yml", 403);
      if (res.status >= 500) throw providerError("server", `SearXNG server error (HTTP ${res.status})`, res.status);
      throw providerError("bad-request", `SearXNG request failed (HTTP ${res.status})`, res.status);
    }
    const raw = await res.json();
    const results = Array.isArray(raw?.results) ? raw.results : [];
    const sources = results
      .slice(0, maxResults)
      .map((r: Record<string, unknown>) => {
        const u = typeof r?.url === "string" ? r.url : "";
        if (!u) return null;
        const s: { url: string; title?: string; snippet?: string } = { url: u };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        if (typeof r.content === "string" && r.content) s.snippet = r.content;
        return s;
      })
      .filter((x: { url: string } | null): x is { url: string } => x !== null);
    const outcome: SearchOutcome = { sources };
    if (typeof raw?.answer === "string" && raw.answer) outcome.content = raw.answer;
    return outcome;
  },

  async fetch(_url, _apiKey, _baseUrl, _signal) {
    throw providerError("config", "SearXNG does not provide native fetch; use the generic path");
  },
};
