/**
 * dsh-web-tools — Tavily quota via the official /usage endpoint.
 * GET https://api.tavily.com/usage with Authorization: Bearer <key>.
 * @module
 */
import type { QuotaSnapshot } from "../quota.ts";
import { providerError } from "./types.ts";

const TAVILY_USAGE_URL = "https://api.tavily.com/usage";

export async function tavilyQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot> {
  if (!apiKey) throw providerError("config", "Tavily API key is not configured");
  const res = await fetch(TAVILY_USAGE_URL, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw providerError("auth", `Tavily usage auth failed (HTTP ${res.status})`, res.status);
    if (res.status === 429) throw providerError("rate-limit", "Tavily rate limit exceeded (HTTP 429)", res.status);
    throw providerError("server", `Tavily usage failed (HTTP ${res.status})`, res.status);
  }
  const raw = await res.json();

  // Prefer the account-level plan numbers; fall back to key-level.
  const account = raw?.account;
  const key = raw?.key;
  const limit = account?.plan_limit ?? key?.limit;
  const usage = account?.plan_usage ?? key?.usage;
  const breakdown: Record<string, number> = {};
  for (const field of ["search_usage", "extract_usage", "crawl_usage", "map_usage", "research_usage"]) {
    const v = raw?.key?.[field];
    if (typeof v === "number") breakdown[field.replace("_usage", "")] = v;
  }

  return {
    supported: true,
    authoritative: true,
    unit: "credits",
    ...(typeof usage === "number" && typeof limit === "number" ? { remaining: Math.max(0, limit - usage), limit } : {}),
    breakdown: Object.keys(breakdown).length > 0 ? breakdown : undefined,
    source: "api",
    fetchedAt: Date.now(),
    ...(typeof raw?.key?.limit === "number" ? { note: `plan: ${account?.current_plan ?? "unknown"}` } : {}),
  };
}
