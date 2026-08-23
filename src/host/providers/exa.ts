/**
 * dsh-web-tools — Exa provider adapter (neural/semantic search).
 *
 * Canonical reference: https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 * - POST https://api.exa.ai/search with `x-api-key` header (canonical raw REST)
 * - Content mode: `contents.highlights = true` (token-efficient extractive highlights)
 * - `type: "auto"` for balanced neural / keyword retrieval
 * - /contents uses `urls` + `text: true` for full-page markdown fetch
 *
 * @module
 */
import { providerError, classifyHttpStatus, resolveContext, parseRetryAfter, type ProviderAdapter, type SearchOutcome, type ProviderExecutionContext } from "./types.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
import type { ExaProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";

/**
 * Build the POST request body for Exa /search.
 * Supports:
 *  - query (cleanQuery)
 *  - type: auto / fast / deep etc.
 *  - category: "research paper" (research), "news" (news), "financial report" (finance), "company", "people"
 *  - includeDomains / excludeDomains
 *  - startPublishedDate / endPublishedDate (ISO 8601)
 *  - userLocation (country code)
 */
export function buildExaSearchBody(
  query: string,
  numResults: number,
  options?: Readonly<ExaProviderOptions>,
  hints?: Readonly<SearchHints>,
): Record<string, unknown> {
  const cleanQ = hints?.cleanQuery ? hints.cleanQuery : query;
  const body: Record<string, unknown> = {
    query: cleanQ,
    type: options?.searchType ?? "auto",
    numResults,
    contents: {
      highlights: true,
      ...(typeof options?.maxAgeHours === "number" ? { maxAgeHours: options.maxAgeHours } : {}),
    },
  };

  // 1. Category mapping (Exa officially uses "publication" for papers/academic, "news", "financial report")
  if (hints?.topic === "research") {
    body.category = "publication";
  } else if (hints?.topic === "news") {
    body.category = "news";
  } else if (hints?.topic === "finance") {
    body.category = "financial report";
  }

  // 2. Domain filters
  if (hints?.domains?.include && hints.domains.include.length > 0) {
    body.includeDomains = hints.domains.include;
  }
  if (hints?.domains?.exclude && hints.domains.exclude.length > 0) {
    body.excludeDomains = hints.domains.exclude;
  }

  // 3. Date filters (ISO 8601)
  if (hints?.freshness?.after) {
    body.startPublishedDate = `${hints.freshness.after}T00:00:00.000Z`;
  }
  if (hints?.freshness?.before) {
    body.endPublishedDate = `${hints.freshness.before}T23:59:59.999Z`;
  }

  // 4. User location
  if (hints?.locale?.country) {
    body.userLocation = hints.locale.country;
  }

  return body;
}

/**
 * Parse an Exa HTTP error response into a classified ProviderError.
 *
 * Exa returns machine-readable error `tag` in the JSON body (verified
 * against https://exa.ai/docs/reference/error-codes):
 *   INVALID_API_KEY → 401, NO_MORE_CREDITS → 402,
 *   API_KEY_BUDGET_EXCEEDED → 402, TEAM_BUDGET_EXCEEDED → 402,
 *   ACCESS_DENIED → 403.
 *
 * 429 has a separate shape (no tag, may carry Retry-After header).
 * We parse Retry-After (seconds → ms) and attach it to the error message
 * so the runtime can use it for cooldown.
 */
async function throwExaError(res: Response): Promise<never> {
  const status = res.status;
  // Try to read Exa's JSON error body for the machine-readable tag.
  let tag: string | undefined;
  let message: string | undefined;
  try {
    const body = await res.json();
    tag = typeof body?.error?.tag === "string" ? body.error.tag : undefined;
    message = typeof body?.error?.message === "string" ? body.error.message : undefined;
  } catch {
    // Non-JSON body — fall through to status-based classification.
  }

  // Retry-After header (seconds) — present on 429, sometimes on 503.
  const retryAfterRaw = res.headers.get("retry-after");
  let retryHint = "";
  if (retryAfterRaw) {
    const seconds = Number(retryAfterRaw);
    if (Number.isFinite(seconds) && seconds > 0) {
      retryHint = ` (retry after ${seconds}s)`;
    }
  }

  // Exa-specific tag → precise code mapping.
  if (tag === "INVALID_API_KEY" || status === 401) {
    throw providerError("auth", `Exa: invalid or missing API key${retryHint}`, status);
  }
  if (tag === "NO_MORE_CREDITS" || tag === "API_KEY_BUDGET_EXCEEDED" || tag === "TEAM_BUDGET_EXCEEDED" || status === 402) {
    throw providerError("quota", `Exa: ${tag ?? "credits exhausted"}${retryHint}`, status);
  }
  if (tag === "ACCESS_DENIED" || status === 403) {
    throw providerError("auth", `Exa: access denied${retryHint}`, status);
  }
  if (status === 429) {
    throw providerError("rate-limit", `Exa: rate limit exceeded${retryHint}`, status, parseRetryAfter(res));
  }
  if (status === 408) {
    throw providerError("timeout", `Exa: request timed out`, status);
  }
  if (status >= 500) {
    throw providerError("server", `Exa: server error (HTTP ${status})${retryHint}`, status);
  }

  // Fallback: classify by status using the shared taxonomy.
  const code = classifyHttpStatus(status);
  throw providerError(code, `Exa: ${message ?? `HTTP ${status}`}${retryHint}`, status);
}

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

  async search(query, maxResults, apiKey, _baseUrl, contextOrSignal) {
    const { signal, options, hints } = resolveContext<ExaProviderOptions>(contextOrSignal);
    const token = (apiKey ?? "").trim();
    if (!token) throw providerError("config", "Exa API key is not configured");
    const numResults = typeof maxResults === "number" && maxResults > 0 ? Math.min(maxResults, 25) : 10;
    const body = buildExaSearchBody(query, numResults, options, hints);
    const res = await fetchWithProxy(EXA_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": token,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) await throwExaError(res);
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

  async fetch(url, apiKey, _baseUrl, contextOrSignal) {
    const { signal, options } = resolveContext<ExaProviderOptions>(contextOrSignal);
    const token = (apiKey ?? "").trim();
    if (!token) throw providerError("config", "Exa API key is not configured");
    const body: Record<string, unknown> = {
      urls: [url],
      text: true,
    };
    // Share the same content freshness setting as search (maxAgeHours).
    if (typeof options?.maxAgeHours === "number") {
      body.maxAgeHours = options.maxAgeHours;
    }
    const res = await fetchWithProxy(EXA_CONTENTS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": token,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) await throwExaError(res);
    const data = await res.json();
    // Exa /contents returns per-URL statuses in data.statuses[] (HTTP 200 may still have a URL error).
    const statusEntry = Array.isArray(data?.statuses) ? data.statuses[0] : undefined;
    if (statusEntry && statusEntry.status !== "success" && statusEntry.status !== 200) {
      const errMsg = statusEntry.error?.message || statusEntry.error?.tag || `status ${statusEntry.status}`;
      throw providerError("server", `Exa /contents failed for ${url}: ${errMsg}`);
    }
    const result = data?.results?.[0];
    const text = typeof result?.text === "string" ? result.text : "";
    if (!text) throw providerError("server", `Exa returned no text content for ${url}`);
    return { text };
  },
};

