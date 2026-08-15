/**
 * dsh-web-tools — Jina provider adapter.
 *
 * Search: POST https://s.jina.ai/ (Authorization: Bearer) — Jina's search
 *   endpoint returns text-ish results; parse URLs from the structured output.
 * Balance (best effort): GET https://r.jina.ai/ with the Bearer token returns
 *   a text page containing a "Balance left" line with the remaining tokens.
 *   This is a stable-but-unofficial contract — never authoritative, and a
 *   parse failure must degrade to "quota unavailable", never break search.
 * @module
 */
import { providerError, type ProviderAdapter, type SearchOutcome } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";

const JINA_SEARCH_URL = "https://s.jina.ai/";
const JINA_READER_URL = "https://r.jina.ai/";

export const JINA_META = {
  name: "jina",
  label: "Jina",
  description: "Reader + search (token based)",
  credSuffix: "JINA",
  fetchCapable: true,
  needsBaseUrl: false,
} as const;

export const JinaProvider: ProviderAdapter = {
  ...JINA_META,

  async search(query, maxResults, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "Jina API key is not configured");
    const res = await fetch(JINA_SEARCH_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ q: query, count: maxResults }),
      signal,
    });
    throwIfHttp(res);
    const text = await res.text();
    const sources = parseJinaSearchText(text, maxResults);
    return { sources };
  },

  async fetch(url, apiKey, _baseUrl, signal) {
    if (!apiKey) throw providerError("config", "Jina API key is not configured");
    const res = await fetch(`${JINA_READER_URL}${encodeURIComponent(url)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal,
    });
    throwIfHttp(res);
    return { text: await res.text() };
  },
};

/** Parse Jina's text-ish search output into sources (URL/Title/Snippet lines). */
function parseJinaSearchText(text: string, maxResults: number): SearchOutcome["sources"] {
  // Jina search returns blocks like:
  //   Title: ...
  //   URL: https://...
  //   Description: ...
  const sources: SearchOutcome["sources"] = [];
  const lines = text.split(/\r?\n/);
  let current: { url: string; title?: string; snippet?: string } | null = null;
  const push = () => {
    if (current?.url) {
      sources.push(current);
      current = null;
    }
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Title:")) {
      push();
      current = { url: "" };
      const v = trimmed.slice(6).trim();
      if (v) current.title = v;
    } else if (trimmed.startsWith("URL:")) {
      const v = trimmed.slice(4).trim();
      if (current) current.url = v;
      else if (v) current = { url: v };
    } else if (trimmed.startsWith("Description:")) {
      const v = trimmed.slice(12).trim();
      if (current) current.snippet = v;
    } else if (trimmed === "" || trimmed === "---") {
      push();
    }
    if (sources.length >= maxResults) break;
  }
  push();
  return sources;
}

/**
 * Parse the "Balance left" line from Jina Reader output (best effort).
 * Defensive: any format change → undefined → quota shows unavailable.
 */
export function parseJinaBalance(text: string): number | undefined {
  const line = text.split(/\r?\n/).find((x) => /balance\s+left/i.test(x));
  if (!line) return undefined;
  const value = line.match(/([\d,.]+)/)?.[1];
  if (!value) return undefined;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Best-effort Jina quota (never authoritative). */
export async function jinaQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot> {
  if (!apiKey) throw providerError("config", "Jina API key is not configured");
  const res = await fetch(JINA_READER_URL, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw providerError("auth", `Jina balance auth failed (HTTP ${res.status})`, res.status);
    if (res.status === 429) throw providerError("rate-limit", "Jina rate limit exceeded (HTTP 429)", res.status);
    throw providerError("server", `Jina balance failed (HTTP ${res.status})`, res.status);
  }
  const text = await res.text();
  const balance = parseJinaBalance(text);
  return {
    supported: true,
    authoritative: false,
    unit: "tokens",
    ...(balance !== undefined ? { remaining: balance } : {}),
    source: "best_effort_api",
    fetchedAt: Date.now(),
    note: "Best-effort balance from Jina Reader; not an official billing API",
  };
}

function throwIfHttp(res: Response) {
  if (res.ok) return;
  if (res.status === 401 || res.status === 403) throw providerError("auth", `Jina auth failed (HTTP ${res.status})`, res.status);
  if (res.status === 429) throw providerError("rate-limit", "Jina rate limit exceeded (HTTP 429)", res.status);
  if (res.status >= 500) throw providerError("server", `Jina server error (HTTP ${res.status})`, res.status);
  throw providerError("bad-request", `Jina request failed (HTTP ${res.status})`, res.status);
}
