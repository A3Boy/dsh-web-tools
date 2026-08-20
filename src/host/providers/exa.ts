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
import { providerError, throwIfHttp, type ProviderAdapter, type SearchOutcome } from "./types.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
import type {
  AdvancedSearchResult,
  AdvancedSearchSource,
  AdvancedFieldError,
  AdvancedValidationResult,
  AdvancedProviderFailure,
  ProviderAdvancedContract,
  ProviderCapabilityState,
  AdvancedSearchExecutionContext,
} from "../advanced-search-types.ts";

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
  ...EXA_META,

  async search(query, maxResults, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "Exa API key is not configured");
    const res = await fetchWithProxy(EXA_SEARCH_URL, {
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
    throwIfHttp("Exa", res);
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
    const res = await fetchWithProxy(EXA_CONTENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ urls: [url], highlights: true }),
      signal,
    });
    throwIfHttp("Exa", res);
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

// ===========================================================================
// Advanced contract — provider-native Exa search capabilities.
// Agent-facing schema uses snake_case (project convention); wire uses
// camelCase + x-api-key (official REST contract). Highlights are the
// preferred evidence type (extractive, token-efficient per Exa docs).
// ===========================================================================

/** Exa search types (official enum, latency ranges from ~250ms to ~40s). */
const EXA_TYPES = ["auto", "instant", "fast", "deep-lite", "deep", "deep-reasoning"] as const;
type ExaType = typeof EXA_TYPES[number];

/** Deep-search variants (additionalQueries only valid with these). */
const EXA_DEEP_TYPES = new Set<ExaType>(["deep-lite", "deep", "deep-reasoning"]);

/** Official category enum (verified against https://exa.ai/docs/reference/search). */
const EXA_CATEGORIES = ["company", "people", "research paper", "news", "personal site", "financial report"] as const;
type ExaCategory = typeof EXA_CATEGORIES[number];

/** Categories that restrict domain/date filters (would 400 at the API). */
const EXA_RESTRICTED_CATEGORIES = new Set<ExaCategory>(["company", "people"]);

/**
 * Provider-native Exa advanced request. Agent-facing tool schema fields use
 * snake_case; `toWire` translates to camelCase for the REST API.
 */
export interface ExaAdvancedRequest {
  readonly query: string;
  readonly type?: ExaType;
  readonly num_results?: number;
  readonly category?: ExaCategory;
  readonly include_domains?: readonly string[];
  readonly exclude_domains?: readonly string[];
  readonly start_published_date?: string;
  readonly end_published_date?: string;
  readonly additional_queries?: readonly string[];
  readonly highlights?: boolean;
  readonly max_age_hours?: number;
}

/** Agent-facing tool schema (dsh-tools ParameterSchemaSpec shape). */
const EXA_ADVANCED_PARAMETERS: Record<string, unknown> = {
  query: {
    type: "string",
    required: true,
    description: "The search query (1–2048 characters). Include an absolute date for current/latest/as-of claims.",
  },
  type: {
    type: "string",
    enum: [...EXA_TYPES],
    description: "Search mode: auto (default, ~1s), instant (~250ms), fast (~450ms), deep-lite (4s), deep (4–15s), deep-reasoning (12–40s). deeper types perform multi-step retrieval.",
  },
  num_results: {
    type: "integer",
    description: "Number of results (1–100, default 10).",
  },
  category: {
    type: "string",
    enum: [...EXA_CATEGORIES],
    description: "Data category: company, people, research paper, news, personal site, financial report.",
  },
  include_domains: {
    type: "array",
    items: { type: "string" },
    description: "Restrict results to these domains/paths/wildcards (e.g. arxiv.org, exa.ai/blog, *.substack.com).",
  },
  exclude_domains: {
    type: "array",
    items: { type: "string" },
    description: "Exclude results from these domains/paths/wildcards.",
  },
  start_published_date: {
    type: "string",
    description: "ISO 8601 date: only results published after this date.",
  },
  end_published_date: {
    type: "string",
    description: "ISO 8601 date: only results published before this date.",
  },
  additional_queries: {
    type: "array",
    items: { type: "string" },
    description: "Extra query variations for broader deep-search results. ONLY valid with type deep-lite, deep, or deep-reasoning.",
  },
  highlights: {
    type: "boolean",
    description: "Return query-relevant extractive passages (highlights). Default true — recommended for agent workflows (token-efficient).",
  },
  max_age_hours: {
    type: "integer",
    description: "Only return pages crawled within the last N hours.",
  },
};

/** Protocol text injected into the system prompt when Exa is the active provider. */
const EXA_PROTOCOL = [
  "Active search provider: Exa.",
  "",
  "Exa is a neural search engine built for AI agents. The tool schema is authoritative.",
  "Highlights are query-relevant extractive passages — the preferred verified evidence.",
  "Set an absolute date for current/latest/as-of claims; use num_results for breadth.",
  "additional_queries ONLY works with deep-lite/deep/deep-reasoning types.",
  "category company/people restricts domain and date filters — do not combine them.",
].join("\n");

/** Exa wire request (camelCase per official REST API). */
interface ExaWireRequest {
  query: string;
  type?: ExaType;
  numResults?: number;
  category?: ExaCategory;
  includeDomains?: readonly string[];
  excludeDomains?: readonly string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  additionalQueries?: readonly string[];
  contents?: {
    highlights?: { maxCharacters?: number } | true;
    maxAgeHours?: number;
  };
}

/** Translate the agent-facing request into the Exa REST wire body. */
function toWire(req: ExaAdvancedRequest): ExaWireRequest {
  const wire: ExaWireRequest = { query: req.query };
  if (req.type !== undefined) wire.type = req.type;
  if (req.num_results !== undefined) wire.numResults = req.num_results;
  if (req.category !== undefined) wire.category = req.category;
  if (req.include_domains !== undefined) wire.includeDomains = req.include_domains;
  if (req.exclude_domains !== undefined) wire.excludeDomains = req.exclude_domains;
  if (req.start_published_date !== undefined) wire.startPublishedDate = req.start_published_date;
  if (req.end_published_date !== undefined) wire.endPublishedDate = req.end_published_date;
  if (req.additional_queries !== undefined) wire.additionalQueries = req.additional_queries;
  // Highlights: default true (recommended by Exa for agent workflows).
  const wantHighlights = req.highlights !== false; // undefined or true → true
  const maxAgeHours = req.max_age_hours;
  if (wantHighlights || maxAgeHours !== undefined) {
    const contents: ExaWireRequest["contents"] = {};
    if (wantHighlights) {
      contents.highlights = { maxCharacters: 4000 };
    }
    if (maxAgeHours !== undefined) {
      contents.maxAgeHours = maxAgeHours;
    }
    wire.contents = contents;
  }
  return wire;
}

// ---------------------------------------------------------------------------
// Preflight validator — deterministic, no network.
// Catches Exa-specific option conflicts before wasting an API call.
// ---------------------------------------------------------------------------

function isISODate(value: string): boolean {
  // Accept full ISO 8601 or date-only (YYYY-MM-DD).
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(value) && !Number.isNaN(Date.parse(value));
}

function validateExa(input: unknown, _capabilities: ProviderCapabilityState): AdvancedValidationResult<ExaAdvancedRequest> {
  if (typeof input !== "object" || input === null) {
    return { ok: false, fieldErrors: [{ path: "", message: "request must be an object" }] };
  }
  const raw = input as Record<string, unknown>;
  const errors: AdvancedFieldError[] = [];

  // query: required string, 1-2048 chars
  if (typeof raw.query !== "string" || raw.query.trim().length === 0) {
    errors.push({ path: "query", message: "query is required and must be a non-empty string" });
  } else if (raw.query.length > 2048) {
    errors.push({ path: "query", message: "query must be at most 2048 characters" });
  }

  // type: enum
  const typeRaw = raw.type;
  let type: ExaType | undefined;
  if (typeRaw !== undefined) {
    if (typeof typeRaw !== "string" || !EXA_TYPES.includes(typeRaw as ExaType)) {
      errors.push({ path: "type", message: `type must be one of: ${EXA_TYPES.join(", ")}` });
    } else {
      type = typeRaw as ExaType;
    }
  }

  // num_results: integer 1-100
  if (raw.num_results !== undefined) {
    const n = raw.num_results;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 100) {
      errors.push({ path: "num_results", message: "num_results must be an integer between 1 and 100" });
    }
  }

  // category: enum
  let category: ExaCategory | undefined;
  if (raw.category !== undefined) {
    if (typeof raw.category !== "string" || !EXA_CATEGORIES.includes(raw.category as ExaCategory)) {
      errors.push({ path: "category", message: `category must be one of: ${EXA_CATEGORIES.join(", ")}` });
    } else {
      category = raw.category as ExaCategory;
    }
  }

  // include_domains / exclude_domains: string arrays
  let includeDomains: readonly string[] | undefined;
  if (raw.include_domains !== undefined) {
    if (!Array.isArray(raw.include_domains) || raw.include_domains.some((v) => typeof v !== "string")) {
      errors.push({ path: "include_domains", message: "include_domains must be an array of strings" });
    } else {
      includeDomains = raw.include_domains as string[];
    }
  }
  let excludeDomains: readonly string[] | undefined;
  if (raw.exclude_domains !== undefined) {
    if (!Array.isArray(raw.exclude_domains) || raw.exclude_domains.some((v) => typeof v !== "string")) {
      errors.push({ path: "exclude_domains", message: "exclude_domains must be an array of strings" });
    } else {
      excludeDomains = raw.exclude_domains as string[];
    }
  }

  // start/end_published_date: ISO 8601
  let startDate: string | undefined;
  if (raw.start_published_date !== undefined) {
    if (typeof raw.start_published_date !== "string" || !isISODate(raw.start_published_date)) {
      errors.push({ path: "start_published_date", message: "start_published_date must be a valid ISO 8601 date" });
    } else {
      startDate = raw.start_published_date;
    }
  }
  let endDate: string | undefined;
  if (raw.end_published_date !== undefined) {
    if (typeof raw.end_published_date !== "string" || !isISODate(raw.end_published_date)) {
      errors.push({ path: "end_published_date", message: "end_published_date must be a valid ISO 8601 date" });
    } else {
      endDate = raw.end_published_date;
    }
  }

  // additional_queries: string array — ONLY valid with deep variants
  let additionalQueries: readonly string[] | undefined;
  if (raw.additional_queries !== undefined) {
    if (!Array.isArray(raw.additional_queries) || raw.additional_queries.some((v) => typeof v !== "string")) {
      errors.push({ path: "additional_queries", message: "additional_queries must be an array of strings" });
    } else {
      additionalQueries = raw.additional_queries as string[];
    }
  }
  if (additionalQueries !== undefined && additionalQueries.length > 0 && type !== undefined && !EXA_DEEP_TYPES.has(type)) {
    errors.push({
      path: "additional_queries",
      message: "additional_queries requires a deep-search type (deep-lite, deep, or deep-reasoning)",
    });
  }

  // Exa-specific option conflicts: company/people categories restrict filters.
  if (category !== undefined && EXA_RESTRICTED_CATEGORIES.has(category)) {
    if (excludeDomains !== undefined && excludeDomains.length > 0) {
      errors.push({
        path: "exclude_domains",
        message: `category "${category}" does not support exclude_domains`,
      });
    }
    if (startDate !== undefined || endDate !== undefined) {
      errors.push({
        path: "start_published_date",
        message: `category "${category}" does not support published date filters`,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, fieldErrors: errors };
  }

  const request: ExaAdvancedRequest = {
    query: (raw.query as string).trim(),
    ...(type === undefined ? {} : { type }),
    ...(raw.num_results === undefined ? {} : { num_results: raw.num_results as number }),
    ...(category === undefined ? {} : { category }),
    ...(includeDomains === undefined ? {} : { include_domains: includeDomains }),
    ...(excludeDomains === undefined ? {} : { exclude_domains: excludeDomains }),
    ...(startDate === undefined ? {} : { start_published_date: startDate }),
    ...(endDate === undefined ? {} : { end_published_date: endDate }),
    ...(additionalQueries === undefined ? {} : { additional_queries: additionalQueries }),
    ...(raw.highlights === undefined ? {} : { highlights: raw.highlights as boolean }),
    ...(raw.max_age_hours === undefined ? {} : { max_age_hours: raw.max_age_hours as number }),
  };
  return { ok: true, request };
}

// ---------------------------------------------------------------------------
// Wire execution + evidence normalization.
// ---------------------------------------------------------------------------

const EXA_ADVANCED_SEARCH_URL = "https://api.exa.ai/search";

/** Normalize the Exa REST response into AdvancedSearchSource[]. */
function normalizeExaResults(raw: unknown, maxResults: number): { sources: AdvancedSearchSource[]; truncated: boolean } {
  const results = Array.isArray((raw as { results?: unknown } | null)?.results) ? (raw as { results: unknown[] }).results : [];
  const sources: AdvancedSearchSource[] = [];
  for (const item of results) {
    if (sources.length >= maxResults) break;
    if (!item || typeof item !== "object") continue;
    const r = item as { url?: unknown; title?: unknown; highlights?: unknown; publishedDate?: unknown; score?: unknown };
    if (typeof r.url !== "string" || r.url.length === 0) continue;
    const source: { url: string; title?: string; snippet?: string; publishedAt?: string } = { url: r.url };
    if (typeof r.title === "string" && r.title) source.title = r.title;
    // Highlights: array of extractive passages → join into snippet.
    if (Array.isArray(r.highlights)) {
      const text = r.highlights.filter((h) => typeof h === "string").join("\n").trim();
      if (text) source.snippet = text;
    }
    if (typeof r.publishedDate === "string" && r.publishedDate) source.publishedAt = r.publishedDate;
    sources.push(source);
  }
  return { sources, truncated: results.length > sources.length };
}

/** Exa advanced search execution. */
async function searchExaAdvanced(
  request: ExaAdvancedRequest,
  context: AdvancedSearchExecutionContext,
): Promise<AdvancedSearchResult> {
  const wire = toWire(request);
  const maxResults = request.num_results ?? 10;
  const body = JSON.stringify(wire);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": context.apiKey,
  };

  let response: Response;
  try {
    response = await fetchWithProxy(EXA_ADVANCED_SEARCH_URL, {
      method: "POST",
      headers,
      body,
      signal: context.signal,
    });
  } catch (error) {
    // fetchWithProxy may throw on network/proxy failure.
    throw error;
  }

  if (response.status >= 400) {
    // Let classifyExaError handle HTTP failures.
    throw Object.assign(new Error(`Exa returned HTTP ${response.status}`), {
      _httpStatus: response.status,
      _retryAfter: response.headers.get("retry-after"),
    });
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return {
      ok: false,
      failure: { code: "UPSTREAM", message: "Exa returned invalid JSON" },
    };
  }

  const { sources, truncated } = normalizeExaResults(raw, maxResults);
  return { ok: true, sources, truncated };
}

/** Classify an Exa error into the advanced failure taxonomy. */
function classifyExaError(error: unknown): AdvancedProviderFailure {
  const e = error as { _httpStatus?: number; _retryAfter?: string | null; message?: string; name?: string };
  const httpStatus = e?._httpStatus;
  const retryAfterRaw = e?._retryAfter;

  // Abort / timeout sentinel errors from runWithTimeout.
  if (e?.name === "AdvancedSearchAbortError") {
    return { code: "ABORTED", message: "search aborted by caller" };
  }
  if (e?.name === "AdvancedSearchTimeoutError") {
    return { code: "TIMEOUT", message: e?.message ?? "Exa request timed out" };
  }

  // Retry-After header parsing (seconds → ms).
  let retryAfterMs: number | undefined;
  if (retryAfterRaw !== undefined && retryAfterRaw !== null) {
    const seconds = Number(retryAfterRaw);
    if (Number.isFinite(seconds)) retryAfterMs = seconds * 1000;
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return { code: "AUTH", message: "Exa API key is invalid or unauthorized", httpStatus };
  }
  if (httpStatus === 429) {
    return {
      code: "RATE_LIMIT",
      message: "Exa rate limit exceeded",
      httpStatus,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if (httpStatus === 400) {
    return { code: "REQUEST_INVALID", message: e?.message ?? "Exa rejected the request (HTTP 400)", httpStatus };
  }
  if (httpStatus !== undefined && httpStatus >= 500) {
    return { code: "UPSTREAM", message: `Exa returned HTTP ${httpStatus}`, httpStatus };
  }

  // Network-level errors (fetch threw, no HTTP status).
  const msg = e?.message ?? String(error);
  if (/timeout|timed out/i.test(msg)) {
    return { code: "TIMEOUT", message: msg };
  }
  if (/abort/i.test(msg)) {
    return { code: "ABORTED", message: msg };
  }
  return { code: "NETWORK", message: msg };
}

// ---------------------------------------------------------------------------
// Export the Exa advanced contract.
// ---------------------------------------------------------------------------

/** The Exa provider-native advanced search contract. */
export const EXA_ADVANCED: ProviderAdvancedContract<ExaAdvancedRequest> = {
  toolName: "web_search_exa",
  toolDescription: "Advanced Exa search with neural search types, category filtering, date ranges, domain filters, highlights, and multi-query deep search. Exa is built for AI agents — prefer highlights (token-efficient extractive passages) over full text.",
  toolParameters: EXA_ADVANCED_PARAMETERS,
  protocolText: EXA_PROTOCOL,
  validate: validateExa,
  search: searchExaAdvanced,
  classifyError: classifyExaError,
};

// Attach the advanced contract to the adapter (deferred to avoid TDZ —
// EXA_ADVANCED depends on functions defined after ExaProvider).
ExaProvider.advanced = EXA_ADVANCED;

