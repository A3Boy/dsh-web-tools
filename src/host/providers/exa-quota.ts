/**
 * dsh-web-tools — Exa quota via the official Team Management usage API.
 *
 * Exa exposes per-API-key usage/cost through its admin endpoints:
 *   GET https://admin-api.exa.ai/team-management/api-keys/{id}/usage
 *   x-api-key: EXA_SERVICE_KEY
 *
 * This requires TWO extra credentials beyond the normal search key:
 *   - EXA_SERVICE_KEY (team management service key)
 *   - the API key's own id
 * With only a plain search key, Exa has no public balance endpoint — the
 * registry falls back to a local usage estimate (never authoritative).
 * @module
 */
import type { QuotaSnapshot } from "../quota.ts";
import { providerError } from "./types.ts";

const EXA_ADMIN_BASE = "https://admin-api.exa.ai";

/** Optional Team-Management configuration for authoritative Exa usage. */
export interface ExaAdminCredentials {
  /** Team management service key (x-api-key for admin endpoints). */
  serviceKey?: string;
  /** The search API key's id within team management. */
  apiKeyId?: string;
}

/**
 * Fetch Exa's official usage/cost for one API key.
 * @param apiKeyId the API key's id (from team management).
 * @param serviceKey team management service key.
 * @param signal
 * @returns authoritative usage snapshot (cost in USD cents).
 */
export async function exaQuota(apiKeyId: string, serviceKey: string, signal?: AbortSignal): Promise<QuotaSnapshot> {
  if (!apiKeyId || !serviceKey) throw providerError("config", "Exa usage requires EXA_SERVICE_KEY and an API key id");
  const res = await fetch(`${EXA_ADMIN_BASE}/team-management/api-keys/${encodeURIComponent(apiKeyId)}/usage`, {
    headers: { "x-api-key": serviceKey, accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw providerError("auth", `Exa admin auth failed (HTTP ${res.status})`, res.status);
    if (res.status === 429) throw providerError("rate-limit", "Exa rate limit exceeded (HTTP 429)", res.status);
    throw providerError("server", `Exa usage failed (HTTP ${res.status})`, res.status);
  }
  const raw = await res.json();
  // { total_cost_usd, cost_breakdown: [...] } — cost, not a balance.
  const totalUsd = typeof raw?.total_cost_usd === "number" ? raw.total_cost_usd : undefined;
  return {
    supported: true,
    authoritative: true,
    unit: "usd_cents",
    ...(totalUsd !== undefined ? { used: Math.round(totalUsd * 100) } : {}),
    source: "api",
    fetchedAt: Date.now(),
    note: "Exa official usage (cost) — this is usage, not an account balance",
  };
}
