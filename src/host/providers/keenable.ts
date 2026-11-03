/**
 * dsh-web-tools — Keenable provider adapter.
 *
 * Search: POST https://api.keenable.ai/v1/search (X-API-Key) with
 *   `{ query, max_results }`; results live at `results[]` with
 *   `{ title, url, description, snippet }`. The snippet prefers
 *   `description` and falls back to a truncated `snippet`.
 * Search-only: web_fetch falls back to the built-in generic fetcher.
 * @module
 */
import { providerError, throwIfHttp, resolveContext, type ProviderAdapter, type Source } from "./types.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
import { endpointViewOf } from "../endpoints.ts";

const KEENABLE_SEARCH_URL = "https://api.keenable.ai/v1/search";
const KEENABLE_MAX_RESULTS = 20;
const KEENABLE_SNIPPET_MAX_CHARS = 600;

export const KEENABLE_META = {
  name: "keenable",
  label: "Keenable",
  description: "Web search API (description-first snippets)",
  credSuffix: "KEENABLE",
  fetchCapable: false,
  needsBaseUrl: false,
} as const;

/** Normalize a Keenable `/v1/search` JSON body into sources. Pure, for tests. */
export function parseKeenableSearchJson(body: unknown, limit: number): Source[] {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const sources: Source[] = [];
  for (const r of results as Array<Record<string, unknown>>) {
    const url = typeof r?.url === "string" ? r.url : "";
    if (!url) continue;
    const s: Source = { url };
    if (typeof r.title === "string" && r.title) s.title = r.title;
    if (typeof r.description === "string" && r.description) {
      s.snippet = r.description;
    } else if (typeof r.snippet === "string" && r.snippet) {
      s.snippet = r.snippet.length > KEENABLE_SNIPPET_MAX_CHARS
        ? r.snippet.slice(0, KEENABLE_SNIPPET_MAX_CHARS) + "…"
        : r.snippet;
    }
    sources.push(s);
    if (sources.length >= limit) break;
  }
  return sources;
}

export const KeenableProvider: ProviderAdapter = {
  ...KEENABLE_META,

  async search(query, maxResults, apiKey, baseUrl, contextOrSignal) {
    const { signal, hints } = resolveContext(contextOrSignal);
    const token = (apiKey ?? "").trim();
    if (!token) throw providerError("config", "Keenable API key is not configured");
    const limit = Math.min(Math.max(maxResults ?? 5, 1), KEENABLE_MAX_RESULTS);
    const cleanQ = hints?.cleanQuery ? hints.cleanQuery : query;
    const searchUrl = endpointViewOf("keenable", { keenable: baseUrl })?.url ?? KEENABLE_SEARCH_URL;
    const res = await fetchWithProxy(searchUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-api-key": token,
        "x-keenable-title": "dsh-web-tools",
      },
      body: JSON.stringify({ query: cleanQ, max_results: limit }),
      signal,
    }, { provider: "keenable" });
    throwIfHttp("Keenable", res);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw providerError("invalid-response", "Keenable returned a non-JSON search response");
    }
    return { sources: parseKeenableSearchJson(body, limit) };
  },

  async fetch(_url, _apiKey, _baseUrl, _signal) {
    throw providerError("config", "Keenable does not provide native fetch");
  },
};
