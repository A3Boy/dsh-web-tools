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
import { providerError, throwIfHttp, resolveContext, type ProviderAdapter, type SearchOutcome } from "./types.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
import type { FirecrawlProviderOptions } from "../../shared/provider-options.ts";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const FIRECRAWL_SEARCH_URL = `${FIRECRAWL_BASE}/search`;
const FIRECRAWL_SCRAPE_URL = `${FIRECRAWL_BASE}/scrape`;

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
    const { signal } = resolveContext(contextOrSignal);
    const token = (apiKey ?? "").trim();
    if (!token) throw providerError("config", "Firecrawl API key is not configured");
    const res = await fetchWithProxy(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, limit: maxResults }),
      signal,
    });
    throwIfHttp("Firecrawl", res);
    const raw = await res.json();
    // v2 search returns { success, data: { web: [{url,title,description,markdown,...}] } }
    // or array directly in data[].
    const results = Array.isArray(raw?.data?.web)
      ? raw.data.web
      : Array.isArray(raw?.data)
        ? raw.data
        : [];
    const sources = results
      .map((r: Record<string, unknown>) => {
        const url = typeof r?.url === "string" ? r.url : "";
        if (!url) return null;
        const s: { url: string; title?: string; snippet?: string; publishedAt?: string } = { url };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        // Prefer rich excerpt/markdown slice > description
        const text = typeof r.markdown === "string" && r.markdown
          ? r.markdown.slice(0, 1500)
          : typeof r.description === "string"
            ? r.description.slice(0, 500)
            : undefined;
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

