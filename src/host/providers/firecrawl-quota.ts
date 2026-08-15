/**
 * dsh-web-tools — Firecrawl quota via the official credit-usage endpoint.
 * GET https://api.firecrawl.dev/v2/team/credit-usage with Bearer auth.
 * @module
 */
import type { QuotaSnapshot } from "../quota.ts";
import { providerError } from "./types.ts";

const FIRECRAWL_CREDIT_USAGE_URL = "https://api.firecrawl.dev/v2/team/credit-usage";

export async function firecrawlQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot> {
  if (!apiKey) throw providerError("config", "Firecrawl API key is not configured");
  const res = await fetch(FIRECRAWL_CREDIT_USAGE_URL, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw providerError("auth", `Firecrawl credit-usage auth failed (HTTP ${res.status})`, res.status);
    if (res.status === 429) throw providerError("rate-limit", "Firecrawl rate limit exceeded (HTTP 429)", res.status);
    throw providerError("server", `Firecrawl credit-usage failed (HTTP ${res.status})`, res.status);
  }
  const raw = await res.json();
  const data = raw?.data ?? raw;
  const remaining = data?.remainingCredits;
  const plan = data?.planCredits;
  const resetAt = data?.billingPeriodEnd;

  return {
    supported: true,
    authoritative: true,
    unit: "credits",
    ...(typeof remaining === "number" && typeof plan === "number" ? { remaining, limit: plan } : {}),
    ...(typeof resetAt === "string" && resetAt.length > 0 ? { resetAt } : {}),
    source: "api",
    fetchedAt: Date.now(),
  };
}
