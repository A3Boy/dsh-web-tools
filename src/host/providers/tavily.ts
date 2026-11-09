/**
 * dsh-web-tools — Tavily provider adapter.
 *
 * API reference: https://docs.tavily.com/documentation/api-reference/endpoint/search
 * - Base URL: https://api.tavily.com
 * - Auth: `Authorization: Bearer tvly-...` (verified 2026-08-20)
 * - POST /search — search_depth basic/advanced/fast/ultra-fast, chunks_per_source
 * - POST /extract — URL extraction for web_fetch
 *
 * Error codes (verified):
 *   400 bad request, 401 auth, 429 rate-limit,
 *   432 plan limit exceeded, 433 paygo limit exceeded, 500 server
 *
 * @module
 */
import { providerError, classifyHttpStatus, resolveContext, parseRetryAfter, type ProviderAdapter } from "./types.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
import { endpointViewOf } from "../endpoints.ts";
import type { TavilyProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";

/** Official fallback for search. `/extract` (web_fetch) deliberately stays
 *  pinned: a Tavily-compatible gateway frequently implements only /search. */
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";

/**
 * Tavily's `country` parameter is an enum of lowercase English country *names*
 * ("united states", "china", ...), NOT ISO 3166-1 alpha-2 codes. Sending "US"
 * makes Tavily answer 400 "Invalid country. Must be a valid country name from
 * the list of supported countries".
 *
 * SearchHints emits ISO alpha-2 codes, so translate them here. Only names that
 * appear in Tavily's enum are listed (e.g. no "hong kong").
 * @see https://docs.tavily.com/documentation/api-reference/endpoint/search
 */
const TAVILY_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  US: "united states",
  CN: "china",
  JP: "japan",
  GB: "united kingdom",
  SG: "singapore",
  DE: "germany",
  FR: "france",
  CA: "canada",
  AU: "australia",
  NZ: "new zealand",
  IN: "india",
  KR: "south korea",
  TW: "taiwan",
  BR: "brazil",
  MX: "mexico",
  RU: "russia",
  IT: "italy",
  ES: "spain",
  NL: "netherlands",
  CH: "switzerland",
  SE: "sweden",
  NO: "norway",
  DK: "denmark",
  FI: "finland",
  AT: "austria",
  BE: "belgium",
  IE: "ireland",
  PL: "poland",
  PT: "portugal",
  GR: "greece",
  CZ: "czech republic",
  RO: "romania",
  UA: "ukraine",
  TR: "turkey",
  IL: "israel",
  SA: "saudi arabia",
  AE: "united arab emirates",
  ZA: "south africa",
  NG: "nigeria",
  KE: "kenya",
  EG: "egypt",
  ID: "indonesia",
  MY: "malaysia",
  TH: "thailand",
  VN: "vietnam",
  PH: "philippines",
  PK: "pakistan",
  AR: "argentina",
  CL: "chile",
  CO: "colombia",
  PE: "peru",
};

/** Every country name Tavily currently accepts. */
const TAVILY_VALID_COUNTRY_NAMES: ReadonlySet<string> = new Set(Object.values(TAVILY_COUNTRY_NAMES));

/**
 * Normalize a locale country into a value Tavily accepts.
 * Accepts an ISO 3166-1 alpha-2 code or an already-valid country name.
 * Returns undefined for anything else, so that an unknown/unsupported country
 * is dropped (geo boost only) instead of failing the whole search with 400.
 */
export function tavilyCountryName(country: string | undefined): string | undefined {
  const raw = (country ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  const mapped = TAVILY_COUNTRY_NAMES[raw.toUpperCase()];
  if (mapped) return mapped;
  return TAVILY_VALID_COUNTRY_NAMES.has(raw) ? raw : undefined;
}

/**
 * Build the POST request body for Tavily's /search endpoint.
 * Supports:
 *  - search_depth: "basic" | "advanced" | "fast" | "ultra-fast"
 *  - chunks_per_source: supported on basic, advanced, fast (not ultra-fast)
 *  - topic: "news" | "finance" from hints (code falls back to general)
 *  - time_range: "day" | "week" | "month" | "year"
 *  - start_date: RFC3339 / YYYY-MM-DD from hints
 *  - include_domains / exclude_domains
 *  - country: lowercase country NAME, only when topic stays "general"
 */
export function buildTavilySearchBody(
  query: string,
  maxResults: number | undefined,
  options?: Readonly<TavilyProviderOptions>,
  hints?: Readonly<SearchHints>,
): Record<string, unknown> {
  const max_results = Math.min(Math.max(maxResults ?? 5, 1), 20);
  const cleanQ = hints?.cleanQuery ? hints.cleanQuery : query;

  const requestBody: Record<string, unknown> = {
    query: cleanQ,
    max_results,
    include_answer: false,
  };

  if (options?.autoParameters) {
    requestBody.auto_parameters = true;
  } else {
    const depth = options?.searchDepth ?? "basic";
    requestBody.search_depth = depth;
    // Tavily docs: chunks_per_source is supported on basic, advanced, fast (not ultra-fast)
    if (depth !== "ultra-fast" && typeof options?.chunksPerSource === "number") {
      requestBody.chunks_per_source = options.chunksPerSource;
    }
  }

  // 1. Topic mapping: Tavily accepts general, news, and finance.
  const topic = hints?.topic === "news" || hints?.topic === "finance" ? hints.topic : undefined;
  if (topic) {
    requestBody.topic = topic;
  }

  // 2. Freshness & date filtering
  if (hints?.freshness?.preset) {
    // Tavily does not allow time_range together with start_date or end_date.
    requestBody.time_range = hints.freshness.preset;
  } else {
    if (hints?.freshness?.after) {
      requestBody.start_date = hints.freshness.after;
    }
    if (hints?.freshness?.before) {
      requestBody.end_date = hints.freshness.before;
    }
  }

  // 3. Domain constraints
  if (hints?.domains?.include && hints.domains.include.length > 0) {
    requestBody.include_domains = hints.domains.include;
  }
  if (hints?.domains?.exclude && hints.domains.exclude.length > 0) {
    requestBody.exclude_domains = hints.domains.exclude;
  }

  // 4. Country — Tavily only supports it for the "general" topic and expects a
  //    lowercase country NAME, so translate the ISO code from SearchHints.
  if (!topic) {
    const country = tavilyCountryName(hints?.locale?.country);
    if (country) requestBody.country = country;
  }

  return requestBody;
}

export const TAVILY_META = {
  name: "tavily",
  label: "Tavily",
  description: "AI-optimized web search (chunks & depth)",
  credSuffix: "TAVILY",
  fetchCapable: true,
  needsBaseUrl: false,
} as const;

/**
 * Parse a Tavily HTTP error response into a classified ProviderError.
 * Tavily returns `{ detail: { error: "..." } }` on error.
 * 432 = plan limit, 433 = paygo limit — both treated as quota.
 */
async function throwTavilyError(res: Response): Promise<never> {
  const status = res.status;
  let message: string | undefined;
  try {
    const body = await res.json();
    message = typeof body?.detail?.error === "string" ? body.detail.error : undefined;
  } catch {
    // Non-JSON body — fall through to status-based classification.
  }

  const retryAfterRaw = res.headers.get("retry-after");
  let retryHint = "";
  if (retryAfterRaw) {
    const seconds = Number(retryAfterRaw);
    if (Number.isFinite(seconds) && seconds > 0) {
      retryHint = ` (retry after ${seconds}s)`;
    }
  }

  if (status === 401 || status === 403) {
    throw providerError("auth", `Tavily: ${message ?? "auth failed"}${retryHint}`, status);
  }
  if (status === 432 || status === 433) {
    throw providerError("quota", `Tavily: ${message ?? "plan limit exceeded"}${retryHint}`, status);
  }
  if (status === 429) {
    throw providerError("rate-limit", `Tavily: rate limit exceeded${retryHint}`, status, parseRetryAfter(res));
  }
  if (status === 408) {
    throw providerError("timeout", `Tavily: request timed out`, status);
  }
  if (status >= 500) {
    throw providerError("server", `Tavily: server error (HTTP ${status})${retryHint}`, status);
  }

  const code = classifyHttpStatus(status);
  throw providerError(code, `Tavily: ${message ?? `HTTP ${status}`}${retryHint}`, status);
}

export const TavilyProvider: ProviderAdapter = {
  ...TAVILY_META,

  async search(query, maxResults, apiKey, baseUrl, contextOrSignal) {
    const { signal, options, hints } = resolveContext<TavilyProviderOptions>(contextOrSignal);
    const token = (apiKey ?? "").trim();
    if (!token) throw providerError("config", "Tavily API key is not configured");
    const requestBody = buildTavilySearchBody(query, maxResults, options, hints);
    const searchUrl = endpointViewOf("tavily", { tavily: baseUrl })?.url ?? TAVILY_SEARCH_URL;
    const res = await fetchWithProxy(searchUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    }, { provider: "tavily" });
    if (!res.ok) await throwTavilyError(res);
    const raw = await res.json();
    const results = Array.isArray(raw?.results) ? raw.results : [];
    const sources = results
      .map((r: Record<string, unknown>) => {
        const url = typeof r?.url === "string" ? r.url : "";
        if (!url) return null;
        const s: { url: string; title?: string; snippet?: string; publishedAt?: string } = { url };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        // Tavily returns `content` (NLP summary in basic mode) — the best evidence field.
        if (typeof r.content === "string" && r.content) {
          s.snippet = r.content.length > 1200 ? r.content.slice(0, 1200) + "…" : r.content;
        }
        if (typeof r.published_date === "string" && r.published_date) s.publishedAt = r.published_date;
        return s;
      })
      .filter((x: { url: string } | null): x is { url: string } => x !== null);
    return { sources };
  },

  async fetch(url, apiKey, _baseUrl, contextOrSignal) {
    const { signal, options } = resolveContext<TavilyProviderOptions>(contextOrSignal);
    const token = (apiKey ?? "").trim();
    if (!token) throw providerError("config", "Tavily API key is not configured");
    const body: Record<string, unknown> = { urls: [url] };
    if (options?.fetchExtractDepth) {
      body.extract_depth = options.fetchExtractDepth;
    }
    const res = await fetchWithProxy(TAVILY_EXTRACT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    }, { provider: "tavily" });
    if (!res.ok) await throwTavilyError(res);
    const data = await res.json();
    const failed = Array.isArray(data?.failed_results) ? data.failed_results[0] : undefined;
    if (failed) throw providerError("server", `Tavily extract failed for ${failed.url ?? url}: ${failed.error ?? "unknown"}`);
    const content = data?.results?.[0]?.raw_content;
    if (typeof content !== "string" || !content) throw providerError("server", `Tavily returned no content for ${url}`);
    return { text: content };
  },
};
