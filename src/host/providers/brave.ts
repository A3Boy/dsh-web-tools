/**
 * dsh-web-tools — Brave Search provider adapter.
 *
 * API reference: https://api-dashboard.search.brave.com/documentation/services/llm-context
 * - LLM Context (preferred): POST https://api.search.brave.com/res/v1/llm/context
 *   Returns pre-extracted content optimized for AI agents / RAG.
 *   Response: { grounding: { generic: [{ url, title, snippets[] }] } }
 * - Classic Web Search (fallback): GET https://api.search.brave.com/res/v1/web/search
 *   Used when LLM Context is unavailable (e.g. plan doesn't support it → 403).
 * - Auth: X-Subscription-Token header.
 * - Quota: response headers carry the monthly request budget
 *   (X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset).
 * @module
 */
import { providerError, throwIfHttp, resolveContext, type ProviderAdapter } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
import type { BraveProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";

const BRAVE_LLM_CONTEXT_URL = "https://api.search.brave.com/res/v1/llm/context";
const BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

/**
 * Map SearchHints freshness preset to Brave's freshness parameter:
 * pd = past 24 hours, pw = past 7 days, pm = past 31 days, py = past 365 days
 */
export function mapBraveFreshness(hints?: Readonly<SearchHints>): string | undefined {
  if (!hints?.freshness?.preset) return undefined;
  switch (hints.freshness.preset) {
    case "day": return "pd";
    case "week": return "pw";
    case "month": return "pm";
    case "year": return "py";
  }
}

/**
 * Build the LLM Context request body.
 */
export function buildBraveLlmContextBody(
  query: string,
  maxResults: number | undefined,
  options?: Readonly<BraveProviderOptions>,
  hints?: Readonly<SearchHints>,
): Record<string, unknown> {
  const cleanQ = hints?.cleanQuery ? hints.cleanQuery : query;
  const body: Record<string, unknown> = {
    q: cleanQ,
    count: Math.min(Math.max(maxResults ?? 10, 20), 50),
  };
  if (maxResults !== undefined) {
    body.maximum_number_of_urls = Math.min(Math.max(maxResults, 1), 50);
  }
  if (options?.contextThresholdMode) {
    body.context_threshold_mode = options.contextThresholdMode;
  }
  if (typeof options?.contextTokenBudget === "number") {
    body.maximum_number_of_tokens = options.contextTokenBudget;
  }

  // Freshness & locale
  const freshness = mapBraveFreshness(hints);
  if (freshness) {
    body.freshness = freshness;
  }
  if (hints?.locale?.country) {
    body.country = hints.locale.country;
  }
  if (hints?.locale?.language) {
    body.search_lang = hints.locale.language;
  }

  return body;
}

export const BRAVE_META = {
  name: "brave",
  label: "Brave",
  description: "Independent search index (LLM Context preferred)",
  credSuffix: "BRAVE",
  fetchCapable: false,
  needsBaseUrl: false,
} as const;

export const BraveProvider: ProviderAdapter = {
  ...BRAVE_META,

  async search(query, maxResults, apiKey, _baseUrl, contextOrSignal) {
    const token = (apiKey ?? "").trim();
    if (!token) throw providerError("config", "Brave API key is not configured");
    const { signal, options, hints } = resolveContext<BraveProviderOptions>(contextOrSignal);

    const preferClassic = options?.endpointPreference === "web-search";

    // --- Preferred path: LLM Context endpoint (agent-optimized), skipped if user chose web-search ---
    if (!preferClassic) {
      try {
        const body = buildBraveLlmContextBody(query, maxResults, options, hints);
        const res = await fetchWithProxy(BRAVE_LLM_CONTEXT_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-subscription-token": token,
            accept: "application/json",
          },
          body: JSON.stringify(body),
          signal,
        });

        if (res.ok) {
        // Capture quota headers on success (same as classic endpoint).
        defaultQuotaManager.recordFromHeaders(token, res.headers);

        const raw = await res.json();
        const generic = Array.isArray(raw?.grounding?.generic) ? raw.grounding.generic : [];
        const sources = generic
          .map((g: Record<string, unknown>) => {
            const url = typeof g?.url === "string" ? g.url : "";
            if (!url) return null;
            const s: { url: string; title?: string; snippet?: string } = { url };
            if (typeof g.title === "string" && g.title) s.title = g.title;
            if (Array.isArray(g.snippets)) {
              const text = g.snippets.filter((h: unknown): h is string => typeof h === "string").join("\n").trim();
              if (text) s.snippet = text.length > 1200 ? text.slice(0, 1200) + "…" : text;
            }
            return s;
          })
          .filter((x: { url: string } | null): x is { url: string } => x !== null);
        return { sources };
      }

      // Whitelist same-provider degrade:
      // - 403 = LLM Context forbidden / unavailable for this key/plan → degrade to Web Search
      // - 404 = endpoint not available → degrade to Web Search
      // Explicitly reject fallback on:
      // - 401 (auth failure — classic will also fail)
      // - 429 (rate-limited — should not blast the same key again; let outer pool/fallback handle it)
      // - >= 500 (server errors)
      if (res.status === 403 || res.status === 404) {
        // Safe to degrade to classic Web Search
      } else {
        throwIfHttp("Brave LLM Context", res);
      }
    } catch (error) {
      // Re-throw classified ProviderErrors (from throwIfHttp) or aborts
      if (error && typeof error === "object" && "code" in error) {
        throw error;
      }
      // Unknown client/network errors — re-throw rather than fallback
      throw error;
    }
  }

    // --- Fallback path: classic Web Search endpoint ---
    const url = new URL(BRAVE_WEB_SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(Math.max(maxResults ?? 10, 20), 50))); // candidate pool ≥ 20
    const res = await fetchWithProxy(url, {
      headers: { "x-subscription-token": token, accept: "application/json" },
      signal,
    });
    throwIfHttp("Brave", res);
    defaultQuotaManager.recordFromHeaders(token, res.headers);
    const raw = await res.json();
    const results = Array.isArray(raw?.web?.results) ? raw.web.results : [];
    const sources = results
      .map((r: Record<string, unknown>) => {
        const u = typeof r?.url === "string" ? r.url : "";
        if (!u) return null;
        const s: { url: string; title?: string; snippet?: string; publishedAt?: string } = { url: u };
        if (typeof r.title === "string" && r.title) s.title = r.title;
        if (typeof r.description === "string" && r.description) s.snippet = r.description;
        if (typeof r.age === "string" && r.age) s.publishedAt = r.age;
        return s;
      })
      .filter((x: { url: string } | null): x is { url: string } => x !== null);
    return { sources };
  },

  async fetch(_url, _apiKey, _baseUrl, _signal) {
    throw providerError("config", "Brave does not provide native fetch");
  },
};

export class BraveQuotaManager {
  private cache = new Map<string, QuotaSnapshot>();
  private persistHook?: (apiKey: string, snapshot: QuotaSnapshot) => void;
  private disposed = false;

  constructor(persistHook?: (apiKey: string, snapshot: QuotaSnapshot) => void) {
    this.persistHook = persistHook;
  }

  seed(apiKey: string, snapshot: QuotaSnapshot): void {
    if (this.disposed) return;
    this.cache.set(apiKey, snapshot);
  }

  async getQuota(apiKey: string): Promise<QuotaSnapshot> {
    return this.cache.get(apiKey) ?? {
      supported: false,
      authoritative: false,
      unit: "requests",
      source: "dashboard",
      fetchedAt: Date.now(),
      note: "Run a search first — Brave reports quota in search response headers",
    };
  }

  recordFromHeaders(apiKey: string, headers: Headers): QuotaSnapshot {
    const snapshot = braveQuotaFromHeaders(headers);
    if (!this.disposed) {
      this.cache.set(apiKey, snapshot);
      this.persistHook?.(apiKey, snapshot);
    }
    return snapshot;
  }

  dispose(): void {
    this.disposed = true;
    this.persistHook = undefined;
    this.cache.clear();
  }
}

/** Last-known Brave quota snapshots, keyed by API key (default manager fallback). */
const defaultQuotaManager = new BraveQuotaManager();

/** Set the persistence callback (host wires this to its settings store). */
export function setBraveQuotaPersist(hook: (apiKey: string, snapshot: QuotaSnapshot) => void): void {
  defaultQuotaManager["persistHook"] = hook;
}

/** Seed the in-memory cache from persisted state (host calls on startup). */
export function seedBraveQuota(apiKey: string, snapshot: QuotaSnapshot): void {
  defaultQuotaManager.seed(apiKey, snapshot);
}

/** Quota for the settings card: last-known snapshot for the given key. */
export async function braveQuota(apiKey: string, _baseUrl?: string, _signal?: AbortSignal): Promise<QuotaSnapshot> {
  return defaultQuotaManager.getQuota(apiKey);
}

/** Parse Brave quota from the search response headers (monthly window). */
export function braveQuotaFromHeaders(headers: Headers, fetchedAt = Date.now()): QuotaSnapshot {
  const limitRaw = headers.get("x-ratelimit-limit");
  const remainingRaw = headers.get("x-ratelimit-remaining");
  // Brave sends comma-separated "per-second, per-month" values. The monthly
  // value is the SECOND one; a single value is the per-second burst window
  // only and carries no monthly quota info (parseBravePair ignores it).
  const monthlyLimit = parseBravePair(limitRaw);
  const monthlyRemaining = parseBravePair(remainingRaw);
  const snapshot: QuotaSnapshot = {
    supported: true,
    authoritative: true,
    unit: "requests",
    source: "response_header",
    fetchedAt,
  };
  if (monthlyLimit !== undefined) {
    snapshot.limit = monthlyLimit;
    // Per the Brave docs, a monthly limit of 0 means UNLIMITED — there is no
    // meaningful "remaining" count, so do not report remaining=0 as "0 left".
    if (monthlyLimit > 0) {
      snapshot.remaining = monthlyRemaining ?? 0;
      snapshot.note = "From Brave rate-limit response headers";
    } else {
      // 0 monthly limit = pay-as-you-go with no fixed monthly quota window.
      snapshot.note = "Pay-as-you-go — no monthly quota cap (0 = unlimited per Brave docs)";
    }
  } else {
    // No monthly window in the headers — nothing honest to display.
    snapshot.supported = false;
    snapshot.note = "Monthly quota window not reported in headers";
  }
  return snapshot;
}

/**
 * Take the SECOND (monthly) value of a "sec, month" header pair. A single
 * value is the per-second burst window only — returning undefined there
 * prevents mistaking "0 requests this second" for a zero monthly quota.
 */
function parseBravePair(value: string | null): number | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => Number(s.trim()));
  if (parts.length < 2) return undefined; // per-second burst only, no monthly info
  const monthly = parts[1];
  return Number.isFinite(monthly) ? monthly : undefined;
}
