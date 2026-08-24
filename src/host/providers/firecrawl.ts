/**
 * dsh-web-tools — Firecrawl provider adapter.
 *
 * API reference: https://docs.firecrawl.dev
 * - Base URL: https://api.firecrawl.dev/v2
 * - Auth: `Authorization: Bearer fc-...`
 * - POST /search — discover pages by query
 * - POST /scrape — extract clean markdown from a single URL
 *
 * @module
 */
import { providerError, throwIfHttp, resolveContext, type ProviderAdapter } from "./types.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
import type { FirecrawlProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const FIRECRAWL_SEARCH_URL = `${FIRECRAWL_BASE}/search`;
const FIRECRAWL_SCRAPE_URL = `${FIRECRAWL_BASE}/scrape`;

/**
 * Build the /v2/search request body for Firecrawl.
 * Maps:
 *  - topic=code → categories: ["developer"] (Firecrawl Developer Index for issues, PRs, docs, repos)
 *  - topic=research → categories: ["research"]
 *  - freshness preset → tbs (qdr:d for day, qdr:w for week, qdr:m for month, qdr:y for year)
 *  - hard domains → includeDomains / excludeDomains (mutually exclusive)
 *  - locale country → country
 */
export function buildFirecrawlSearchBody(
  query: string,
  limit: number,
  hints?: Readonly<SearchHints>,
): Record<string, unknown> {
  const cleanQ = hints?.cleanQuery ? hints.cleanQuery : query;
  const body: Record<string, unknown> = {
    query: cleanQ,
    limit,
  };

  // 1. Categories mapping
  if (hints?.topic === "code") {
    body.categories = ["developer"];
  } else if (hints?.topic === "research") {
    body.categories = ["research"];
  }

  // 2. Domain filters (Firecrawl requires includeDomains or excludeDomains to be hostnames only)
  if (hints?.domains?.include && hints.domains.include.length > 0) {
    body.includeDomains = hints.domains.include;
  } else if (hints?.domains?.exclude && hints.domains.exclude.length > 0) {
    body.excludeDomains = hints.domains.exclude;
  }

  // 3. Time filter (tbs)
  if (hints?.freshness?.preset) {
    switch (hints.freshness.preset) {
      case "day":
        body.tbs = "qdr:d";
        break;
      case "week":
        body.tbs = "qdr:w";
        break;
      case "month":
        body.tbs = "qdr:m";
        break;
      case "year":
        body.tbs = "qdr:y";
        break;
    }
  }

  // 4. Country / location
  if (hints?.locale?.country) {
    body.country = hints.locale.country;
  }

  return body;
}

export const FIRECRAWL_META = {
  name: "firecrawl",
  label: "Firecrawl",
  description: "Search + clean scrape (markdown)",
  credSuffix: "FIRECRAWL",
  fetchCapable: true,
  needsBaseUrl: false,
} as const;

export const FirecrawlProvider: ProviderAdapter = {
  ...FIRECRAWL_META,

  async search(query, maxResults, apiKey, _baseUrl, contextOrSignal) {
    const { signal, hints } = resolveContext(contextOrSignal);
    const token = (apiKey ?? "").trim();
    if (!token) throw providerError("config", "Firecrawl API key is not configured");
    const count = typeof maxResults === "number" && maxResults > 0 ? maxResults : 10;
    const res = await fetchWithProxy(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(buildFirecrawlSearchBody(query, count, hints)),
      signal,
    });
    throwIfHttp("Firecrawl", res);
    const raw = await res.json();
    // Firecrawl /search returns results in `data.web` or `data.developer` (Developer Index) or `data` directly.
    const results = Array.isArray(raw?.data?.web)
      ? raw.data.web
      : Array.isArray(raw?.data?.developer)
        ? raw.data.developer
        : Array.isArray(raw?.data)
          ? raw.data
          : [];
    const sources = results
      .map((r: Record<string, unknown>) => {
        const url = typeof r?.url === "string" ? r.url : "";
        if (!url) return null;
        const s: { url: string; title?: string; snippet?: string; publishedAt?: string } = { url };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        // Prefer rich excerpt/markdown slice > matched passages > description
        let text: string | undefined;
        if (typeof r.markdown === "string" && r.markdown) {
          text = r.markdown.slice(0, 1500);
        } else if (Array.isArray(r.passages)) {
          text = r.passages.filter((p): p is string => typeof p === "string").join("\n\n").slice(0, 1200);
        } else if (typeof r.description === "string") {
          text = r.description.slice(0, 500);
        }
        if (text) s.snippet = text;
        if (typeof r.publishedDate === "string") s.publishedAt = r.publishedDate;
        return s;
      })
      .filter((x: { url: string } | null): x is { url: string } => x !== null);
    return { sources };
  },

  async fetch(url, apiKey, _baseUrl, contextOrSignal) {
    const token = (apiKey ?? "").trim();
    if (!token) throw providerError("config", "Firecrawl API key is not configured");
    const { signal, options } = resolveContext<FirecrawlProviderOptions>(contextOrSignal);

    const body: Record<string, unknown> = {
      url,
      formats: ["markdown"],
      onlyMainContent: options?.fetchOnlyMainContent ?? true,
    };
    if (typeof options?.fetchMaxAgeMs === "number") {
      body.maxAge = options.fetchMaxAgeMs;
    }

    const res = await fetchWithProxy(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    });
    throwIfHttp("Firecrawl", res);
    const data = await res.json();
    const markdown = data?.data?.markdown;
    if (typeof markdown !== "string" || !markdown) throw providerError("server", `Firecrawl returned no content for ${url}`);
    return { text: markdown };
  },
};

