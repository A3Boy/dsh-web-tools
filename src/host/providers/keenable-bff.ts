/**
 * dsh-web-tools — Keenable console balance (undocumented BFF route).
 *
 * Keenable has no public usage/balance endpoint: the OpenAPI document exposes
 * only /v1/search, /v1/fetch, /v1/auth/user and /v1/feedback. The web console
 * reads an organization balance from
 *
 *   GET https://api.keenable.ai/bff/organization/balance
 *
 * authenticated with a Supabase session bearer token — an API key is rejected
 * ("Missing bearer token" / "Invalid or expired token"). That route is not
 * documented, not versioned, and may change without notice, so this module is
 * strictly best-effort: every failure returns null and the caller falls back
 * to the local ledger in `keenable-usage.ts`.
 *
 * Credentials come from the environment, never from the provider API key:
 *   KEENABLE_REFRESH_TOKEN  Supabase refresh token (long lived) — refreshed here
 *   KEENABLE_SESSION_TOKEN  Supabase access token (short lived, ~1h) — used as-is
 *
 * @module
 */
import type { QuotaSnapshot } from "../quota.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";

/** Root of the console's backend-for-frontend. */
export const KEENABLE_BFF_BASE = "https://api.keenable.ai/bff";
/** Supabase project behind the Keenable console. */
export const KEENABLE_SUPABASE_URL = "https://caqmfcgrdovyjdhfnwzw.supabase.co";
/**
 * Public (anon) Supabase key shipped in the console bundle. It is not a
 * secret — it only identifies the project to the auth endpoint.
 */
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhcW1mY2dyZG92eWpkaGZud3p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTc4NTYsImV4cCI6MjA3NTU5Mzg1Nn0.gmf-2JuDTOVL7MAEgMYczSbT1P-PI3X1WOG1SXfhkNg";

/** Normalized view of the BFF balance document. */
export interface KeenableBalanceView {
  /** Free monthly allowance, in credits. */
  totalCredits: number;
  /** Credits spent from the allowance this period. */
  spentCredits: number;
  /** Credits left on the free allowance (never below zero). */
  remainingCredits: number;
  /** Purchased credits remaining, when reported. */
  paidCredits: number;
  /** Next monthly reset (ISO), derived from the activation date. */
  resetAt?: string;
  /** Per-SKU spendings plus paid_credits, when reported. */
  breakdown: Record<string, number>;
}

function envValue(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** True when either console session variable is set. */
export function keenableSessionConfigured(): boolean {
  return Boolean(envValue("KEENABLE_REFRESH_TOKEN") || envValue("KEENABLE_SESSION_TOKEN"));
}

function jwtClaims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Expiry (epoch ms) from a JWT, when it carries one. */
function tokenExpiryMs(token: string): number | undefined {
  const exp = jwtClaims(token)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : undefined;
}

/**
 * Stable pool group for the snapshot: every API key of the same console
 * account sees the same organization balance, so the pool merge must not add
 * it up once per key.
 */
function tokenGroup(token: string): string | undefined {
  const claims = jwtClaims(token);
  const sub = claims?.sub;
  return typeof sub === "string" && sub ? "keenable-session:" + sub : undefined;
}

interface AccessToken {
  token: string;
  expiresAt: number;
  group?: string;
}

let cachedSession: { signature: string; access: AccessToken } | null = null;

/**
 * Short memo for the balance document. One quota refresh asks per API key, and
 * every key of an organization sees the same document — without this, a pool
 * of N keys would issue N identical requests at the same instant.
 */
let balanceMemo: { signature: string; at: number; snapshot: QuotaSnapshot } | null = null;
const BALANCE_MEMO_MS = 60_000;

async function refreshSession(refreshToken: string, signal?: AbortSignal): Promise<AccessToken | null> {
  let res: Response;
  try {
    res = await fetchWithProxy(KEENABLE_SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: "Bearer " + SUPABASE_ANON_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal,
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken) return null;
  const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
  return {
    token: accessToken,
    expiresAt: tokenExpiryMs(accessToken) ?? Date.now() + expiresIn * 1000,
    group: tokenGroup(accessToken),
  };
}

/**
 * Resolve a bearer token for the BFF: refresh token first (it never expires by
 * itself), then a pasted access token. Cached until shortly before expiry.
 */
async function resolveAccessToken(
  options: { signal?: AbortSignal; force?: boolean } = {},
): Promise<AccessToken | null> {
  const sessionToken = envValue("KEENABLE_SESSION_TOKEN");
  const refreshToken = envValue("KEENABLE_REFRESH_TOKEN");
  if (!sessionToken && !refreshToken) return null;
  const signature = (sessionToken ?? "") + "|" + (refreshToken ?? "");
  const now = Date.now();
  if (
    !options.force &&
    cachedSession?.signature === signature &&
    cachedSession.access.expiresAt - 60_000 > now
  ) {
    return cachedSession.access;
  }
  let access: AccessToken | null = null;
  if (refreshToken) access = await refreshSession(refreshToken, options.signal);
  if (!access && sessionToken) {
    access = {
      token: sessionToken,
      expiresAt: tokenExpiryMs(sessionToken) ?? now + 10 * 60_000,
      group: tokenGroup(sessionToken),
    };
  }
  if (access) cachedSession = { signature, access };
  return access;
}

function numeric(source: Record<string, unknown>, ...names: string[]): number | undefined {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  }
  return undefined;
}

function textOf(source: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

/**
 * Next monthly reset, mirroring the console: the allowance renews on the
 * activation day-of-month (clamped to the month's last day) at the same UTC
 * time of day.
 */
export function nextMonthlyReset(activationIso: string, now = Date.now()): string | undefined {
  const activation = new Date(activationIso);
  if (Number.isNaN(activation.getTime())) return undefined;
  const day = activation.getUTCDate();
  const hours = activation.getUTCHours();
  const minutes = activation.getUTCMinutes();
  const seconds = activation.getUTCSeconds();
  const today = new Date(now);
  const at = (year: number, month: number) => {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, lastDay), hours, minutes, seconds));
  };
  let next = at(today.getUTCFullYear(), today.getUTCMonth());
  if (next.getTime() <= now) next = at(today.getUTCFullYear(), today.getUTCMonth() + 1);
  return next.toISOString();
}

/**
 * Normalize the BFF balance document.
 *
 * Field names follow the console bundle (`free_credits`, `charged_spendings`
 * or the per-SKU `search_spendings`/`fetch_spendings`/`workflow_spendings`,
 * `paid_credits`, `activation_date`); camelCase spellings are accepted too so
 * a casing change does not silently disable the feature. A document without a
 * recognizable allowance returns null rather than a fake balance.
 */
export function mapKeenableBalance(body: unknown): KeenableBalanceView | null {
  if (!body || typeof body !== "object") return null;
  const source = body as Record<string, unknown>;
  const totalCredits = numeric(source, "free_credits", "freeCredits");
  if (totalCredits === undefined) return null;

  const search = numeric(source, "search_spendings", "searchSpendings");
  const fetchSpend = numeric(source, "fetch_spendings", "fetchSpendings");
  const workflow = numeric(source, "workflow_spendings", "workflowSpendings");
  const charged = numeric(source, "charged_spendings", "chargedSpendings");
  const perSkuTotal = (search ?? 0) + (fetchSpend ?? 0) + (workflow ?? 0);
  const spentCredits = charged ?? perSkuTotal;
  const paidCredits = numeric(source, "paid_credits", "paidCredits") ?? 0;

  const breakdown: Record<string, number> = {};
  if (search !== undefined) breakdown.search = search;
  if (fetchSpend !== undefined) breakdown.fetch = fetchSpend;
  if (workflow !== undefined) breakdown.workflow = workflow;
  if (paidCredits > 0) breakdown.paid_credits = paidCredits;

  const activation = textOf(source, "activation_date", "activationDate");
  const resetAt = activation ? nextMonthlyReset(activation) : undefined;

  return {
    totalCredits,
    spentCredits,
    remainingCredits: Math.max(0, totalCredits - Math.min(spentCredits, totalCredits)),
    paidCredits,
    ...(resetAt ? { resetAt } : {}),
    breakdown,
  };
}

/** Turn a normalized balance into the shared quota snapshot shape. */
export function balanceSnapshot(view: KeenableBalanceView, group?: string): QuotaSnapshot {
  return {
    supported: true,
    authoritative: true,
    unit: "credits",
    remaining: view.remainingCredits,
    used: view.spentCredits,
    limit: view.totalCredits,
    ...(view.resetAt ? { resetAt: view.resetAt } : {}),
    ...(Object.keys(view.breakdown).length > 0 ? { breakdown: view.breakdown } : {}),
    source: "api",
    fetchedAt: Date.now(),
    note: "Keenable console balance (BFF /organization/balance)",
    ...(group ? { group } : {}),
  };
}

type BalanceAttempt =
  | { ok: true; snapshot: QuotaSnapshot }
  | { ok: false; unauthorized: boolean };

async function requestBalance(access: AccessToken, signal?: AbortSignal): Promise<BalanceAttempt> {
  let res: Response;
  try {
    res = await fetchWithProxy(KEENABLE_BFF_BASE + "/organization/balance", {
      method: "GET",
      headers: { accept: "application/json", authorization: "Bearer " + access.token },
      signal,
    });
  } catch {
    return { ok: false, unauthorized: false };
  }
  if (res.status === 401) return { ok: false, unauthorized: true };
  if (!res.ok) return { ok: false, unauthorized: false };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, unauthorized: false };
  }
  const view = mapKeenableBalance(body);
  if (!view) return { ok: false, unauthorized: false };
  return { ok: true, snapshot: balanceSnapshot(view, access.group) };
}

/**
 * Fetch the console balance.
 *
 * Returns null whenever the answer is unavailable — no session configured, an
 * expired/revoked token, a network failure, or an unrecognized document — so
 * the caller can fall back without special-casing errors.
 */
export async function fetchKeenableBalance(signal?: AbortSignal): Promise<QuotaSnapshot | null> {
  if (!keenableSessionConfigured()) return null;
  const signature = (envValue("KEENABLE_SESSION_TOKEN") ?? "") + "|" + (envValue("KEENABLE_REFRESH_TOKEN") ?? "");
  if (balanceMemo && balanceMemo.signature === signature && Date.now() - balanceMemo.at < BALANCE_MEMO_MS) {
    return balanceMemo.snapshot;
  }
  const access = await resolveAccessToken({ signal }).catch(() => null);
  if (!access) return null;
  let attempt = await requestBalance(access, signal);
  if (!attempt.ok && attempt.unauthorized) {
    cachedSession = null;
    const retry = await resolveAccessToken({ signal, force: true }).catch(() => null);
    if (retry) attempt = await requestBalance(retry, signal);
  }
  if (!attempt.ok) return null;
  balanceMemo = { signature, at: Date.now(), snapshot: attempt.snapshot };
  return attempt.snapshot;
}

/** Test seam: drop the cached access token and the balance memo. */
export function resetKeenableBffSession(): void {
  cachedSession = null;
  balanceMemo = null;
}
