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
import { providerError, type ProviderAdapter, type SearchOutcome } from "./types.ts";

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

  async search(query, maxResults, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "Firecrawl API key is not configured");
    const res = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit: maxResults }),
      signal,
    });
    throwIfHttp(res);
    const raw = await res.json();
    // v2 search returns { success, data: { web: [{url,title,description,...}] } }
    const results = Array.isArray(raw?.data?.web) ? raw.data.web : [];
    const sources = results
      .map((r: Record<string, unknown>) => {
        const url = typeof r?.url === "string" ? r.url : "";
        if (!url) return null;
        const s: { url: string; title?: string; snippet?: string } = { url };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        if (typeof r.description === "string" && r.description) s.snippet = r.description.slice(0, 500);
        return s;
      })
      .filter((x: { url: string } | null): x is { url: string } => x !== null);
    return { sources };
  },

  async fetch(url, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "Firecrawl API key is not configured");
    const res = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal,
    });
    throwIfHttp(res);
    const data = await res.json();
    const markdown = data?.data?.markdown;
    if (typeof markdown !== "string" || !markdown) throw providerError("server", `Firecrawl returned no content for ${url}`);
    return { text: markdown };
  },
};

function throwIfHttp(res: Response) {
  if (res.ok) return;
  if (res.status === 401 || res.status === 403) throw providerError("auth", `Firecrawl auth failed (HTTP ${res.status})`, res.status);
  if (res.status === 429) throw providerError("rate-limit", "Firecrawl rate limit exceeded (HTTP 429)", res.status);
  if (res.status >= 500) throw providerError("server", `Firecrawl server error (HTTP ${res.status})`, res.status);
  throw providerError("bad-request", `Firecrawl request failed (HTTP ${res.status})`, res.status);
}
