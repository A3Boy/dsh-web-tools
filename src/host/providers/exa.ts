/**
 * dsh-web-tools — Exa provider adapter (neural/semantic search).
 *
 * Canonical reference: https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 * - POST https://api.exa.ai/search with `x-api-key` header
 * - Content mode: `contents.highlights: true` (token-efficient, recommended
 *   for agent workflows) — NOT `text: true` which can blow up context
 * - `type: "auto"` for balanced relevance/speed
 * - /contents uses `urls` + `highlights` for fetch
 *
 * @module
 */
import { providerError, type ProviderAdapter, type SearchOutcome } from "./types.ts";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";

export const EXA_META = {
  name: "exa",
  label: "Exa",
  description: "Semantic / neural web search",
  credSuffix: "EXA",
  fetchCapable: true,
  needsBaseUrl: false,
} as const;

export const ExaProvider: ProviderAdapter = {
  ...EXA_META,

  async search(query, maxResults, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "Exa API key is not configured");
    const res = await fetch(EXA_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: maxResults,
        contents: { highlights: true },
      }),
      signal,
    });
    throwIfHttp(res);
    const raw = await res.json();
    const results = Array.isArray(raw?.results) ? raw.results : [];
    const sources = results
      .map((r: Record<string, unknown>) => {
        const url = typeof r?.url === "string" ? r.url : "";
        if (!url) return null;
        const s: { url: string; title?: string; snippet?: string; publishedAt?: string } = { url };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        // highlights[] is the query-relevant excerpt (recommended over text)
        if (Array.isArray(r.highlights) && r.highlights.length > 0) {
          s.snippet = r.highlights.filter((h): h is string => typeof h === "string").join(" ").slice(0, 500);
        }
        if (typeof r.publishedDate === "string" && r.publishedDate) s.publishedAt = r.publishedDate;
        return s;
      })
      .filter((x: { url: string } | null): x is { url: string } => x !== null);
    return { sources };
  },

  async fetch(url, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "Exa API key is not configured");
    const res = await fetch(EXA_CONTENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ urls: [url], highlights: true }),
      signal,
    });
    throwIfHttp(res);
    const data = await res.json();
    const result = data?.results?.[0];
    // Exa returns `highlights` (query-relevant excerpts) for token efficiency;
    // fall back to `text` when highlights absent (e.g. /contents without query).
    const highlights = Array.isArray(result?.highlights) ? result.highlights : [];
    const text = typeof result?.text === "string" ? result.text : "";
    const content = highlights.length > 0 ? highlights.join("\n\n") : text;
    if (!content) throw providerError("server", `Exa returned no content for ${url}`);
    return { text: content };
  },
};

function throwIfHttp(res: Response) {
  if (res.ok) return;
  if (res.status === 401 || res.status === 403) throw providerError("auth", `Exa auth failed (HTTP ${res.status})`, res.status);
  if (res.status === 429) throw providerError("rate-limit", "Exa rate limit exceeded (HTTP 429)", res.status);
  if (res.status >= 500) throw providerError("server", `Exa server error (HTTP ${res.status})`, res.status);
  throw providerError("bad-request", `Exa request failed (HTTP ${res.status})`, res.status);
}
