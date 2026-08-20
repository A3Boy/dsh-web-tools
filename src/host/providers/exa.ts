/**
 * dsh-web-tools — Exa provider adapter (neural/semantic search).
 *
 * Canonical reference: https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 * - POST https://api.exa.ai/search with `x-api-key` header (canonical raw REST)
 * - Content mode: `contents.highlights = { maxCharacters: 4000 }` (token-efficient,
 *   highly recommended for agent workflows) — falls back to `text` when highlights
 *   are absent
 * - `type: "auto"` for balanced neural / keyword retrieval
 * - /contents uses `urls` + `highlights` for fetch
 *
 * @module
 */
import { providerError, throwIfHttp, type ProviderAdapter, type SearchOutcome } from "./types.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";

export const EXA_META = {
  name: "exa",
  label: "Exa",
  description: "Semantic / neural web search (highlights & auto search)",
  credSuffix: "EXA",
  fetchCapable: true,
  needsBaseUrl: false,
} as const;

export const ExaProvider: ProviderAdapter = {
  ...EXA_META,

  async search(query, maxResults, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "Exa API key is not configured");
    const numResults = typeof maxResults === "number" && maxResults > 0 ? Math.min(maxResults, 25) : 10;
    const res = await fetchWithProxy(EXA_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults,
        contents: {
          highlights: {
            maxCharacters: 4000,
          },
        },
      }),
      signal,
    });
    throwIfHttp("Exa", res);
    const raw = await res.json();
    const results = Array.isArray(raw?.results) ? raw.results : [];
    const sources = results
      .map((r: Record<string, unknown>) => {
        const url = typeof r?.url === "string" ? r.url : "";
        if (!url) return null;
        const s: { url: string; title?: string; snippet?: string; publishedAt?: string } = { url };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        // highlights[] is query-relevant extractive markup (preferred over raw text for agent density)
        if (Array.isArray(r.highlights) && r.highlights.length > 0) {
          const joined = r.highlights.filter((h): h is string => typeof h === "string").join("\n\n").trim();
          if (joined) s.snippet = joined.length > 1200 ? joined.slice(0, 1200) + "…" : joined;
        } else if (typeof r.text === "string" && r.text) {
          s.snippet = r.text.length > 600 ? r.text.slice(0, 600) + "…" : r.text;
        }
        if (typeof r.publishedDate === "string" && r.publishedDate) s.publishedAt = r.publishedDate;
        return s;
      })
      .filter((x: { url: string } | null): x is { url: string } => x !== null);
    return { sources };
  },

  async fetch(url, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "Exa API key is not configured");
    const res = await fetchWithProxy(EXA_CONTENTS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        urls: [url],
        highlights: {
          maxCharacters: 4000,
        },
        text: true,
      }),
      signal,
    });
    throwIfHttp("Exa", res);
    const data = await res.json();
    const result = data?.results?.[0];
    // Exa returns `highlights` (query-relevant excerpts) for token efficiency;
    // fall back to full `text` when highlights absent.
    const highlights = Array.isArray(result?.highlights) ? result.highlights : [];
    const text = typeof result?.text === "string" ? result.text : "";
    const content = highlights.length > 0 ? highlights.join("\n\n") : text;
    if (!content) throw providerError("server", `Exa returned no content for ${url}`);
    return { text: content };
  },
};

