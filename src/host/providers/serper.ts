/**
 * dsh-web-tools — Serper (Google Search) provider adapter.
 *
 * Search: POST https://google.serper.dev/search (X-API-KEY) with
 *   `{ q, num, gl?, hl?, tbs? }`; results live at `organic[]` with
 *   `{ title, link, snippet, date }`, plus optional `answerBox` or `knowledgeGraph`.
 * API reference: https://serper.dev/playground
 * @module
 */
import { providerError, throwIfHttp, resolveContext, type ProviderAdapter, type Source } from "./types.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
import { endpointViewOf } from "../endpoints.ts";
import type { SearchHints } from "../search-hints.ts";

const SERPER_SEARCH_URL = "https://google.serper.dev/search";
const SERPER_MAX_RESULTS = 20;

export const SERPER_META = {
  name: "serper",
  label: "Serper (Google)",
  description: "Google search API with rich snippets and knowledge graph",
  credSuffix: "SERPER",
  fetchCapable: false,
  needsBaseUrl: false,
} as const;

/** Map SearchHints freshness to Google tbs parameter: qdr:d, qdr:w, qdr:m, qdr:y */
export function mapSerperFreshness(hints?: Readonly<SearchHints>): string | undefined {
  if (!hints?.freshness?.preset) return undefined;
  switch (hints.freshness.preset) {
    case "day": return "qdr:d";
    case "week": return "qdr:w";
    case "month": return "qdr:m";
    case "year": return "qdr:y";
  }
}

/** Build the `/search` request body for Serper. Pure, for tests. */
export function buildSerperSearchBody(
  query: string,
  limit: number,
  hints?: SearchHints,
): Record<string, unknown> {
  let q = hints?.cleanQuery ? hints.cleanQuery : query;

  // Append domain constraints
  if (hints?.domains?.include?.length) {
    q = `${q} site:${hints.domains.include[0]}`;
  }
  if (hints?.domains?.exclude?.length) {
    for (const d of hints.domains.exclude) {
      q = `${q} -site:${d}`;
    }
  }

  const body: Record<string, unknown> = {
    q: q.trim(),
    num: Math.min(Math.max(limit, 1), SERPER_MAX_RESULTS),
  };

  const tbs = mapSerperFreshness(hints);
  if (tbs) body.tbs = tbs;

  if (hints?.locale?.country) {
    body.gl = hints.locale.country.toLowerCase();
  }
  if (hints?.locale?.language) {
    body.hl = hints.locale.language.toLowerCase();
  }

  return body;
}

/** Parse Serper's organic results & answer box into normalized Sources. */
export function parseSerperSearchJson(body: unknown, limit: number): Source[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const sources: Source[] = [];

  // 1. If an answer box exists with a usable link, include as first source
  if (b.answerBox && typeof b.answerBox === "object") {
    const ab = b.answerBox as Record<string, unknown>;
    const link = typeof ab.link === "string" ? ab.link : "";
    const title = typeof ab.title === "string" ? ab.title : "Google Quick Answer";
    const snippet = typeof ab.answer === "string" ? ab.answer : typeof ab.snippet === "string" ? ab.snippet : "";
    if (link && snippet) {
      sources.push({ url: link, title, snippet });
    }
  }

  // 2. Parse organic results
  const organic = b.organic;
  if (Array.isArray(organic)) {
    for (const item of organic as Array<Record<string, unknown>>) {
      if (sources.length >= limit) break;
      const url = typeof item?.link === "string" ? item.link : "";
      if (!url) continue;
      const s: Source = { url };
      if (typeof item.title === "string" && item.title) s.title = item.title;
      if (typeof item.snippet === "string" && item.snippet) s.snippet = item.snippet;
      if (typeof item.date === "string" && item.date) s.publishedAt = item.date;
      sources.push(s);
    }
  }

  return sources;
}

export const SerperProvider: ProviderAdapter = {
  ...SERPER_META,

  async search(query, maxResults, apiKey, baseUrl, contextOrSignal) {
    const { signal, hints } = resolveContext(contextOrSignal);
    const token = (apiKey ?? "").trim();
    if (!token) throw providerError("config", "Serper API key is not configured");
    const limit = Math.min(Math.max(maxResults ?? 5, 1), SERPER_MAX_RESULTS);
    const searchUrl = endpointViewOf("serper", { serper: baseUrl })?.url ?? SERPER_SEARCH_URL;
    const body = buildSerperSearchBody(query, limit, hints);

    const res = await fetchWithProxy(searchUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "X-API-KEY": token,
      },
      body: JSON.stringify(body),
      signal,
    }, { provider: "serper" });
    throwIfHttp("Serper", res);

    let resBody: unknown;
    try {
      resBody = await res.json();
    } catch {
      throw providerError("invalid-response", "Serper returned a non-JSON search response");
    }
    return { sources: parseSerperSearchJson(resBody, limit) };
  },

  async fetch(_url, _apiKey, _baseUrl, _signal) {
    throw providerError("config", "Serper does not provide native fetch");
  },
};
