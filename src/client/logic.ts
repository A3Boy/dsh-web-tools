/**
 * dsh-web-tools — client status & summary logic (pure, framework-free).
 *
 * Extracted from WebToolsSection.tsx so the state model can be unit-tested
 * with plain node (no tsx/jsx involved). No React imports.
 * @module
 */
import type { ProviderView, QuotaView } from "../shared/api-types.ts";

/** t() bound to the dsh-web-tools namespace (injected into the section). */
export type TFunc = (key: string, ...args: unknown[]) => string;

// ---------------------------------------------------------------------------
// page UI language (independent of the DSH-wide locale)
// ---------------------------------------------------------------------------

/** Page language preference: follow the DSH UI language, or force one. */
export type UiLangPref = "auto" | "zh" | "en";

/**
 * Resolve the effective page language. "auto" (or an unknown value) follows
 * the DSH UI language; anything other than "en" falls back to zh.
 */
export function resolveUiLanguage(pref: UiLangPref | undefined, dshActive: string): "zh" | "en" {
  if (pref === "zh" || pref === "en") return pref;
  return dshActive === "en" ? "en" : "zh";
}

/**
 * Translate one key from a locale dictionary with cross-locale fallback
 * ({name} placeholder substitution). Returns undefined when neither dict has
 * the key — the caller falls back to the DSH-bound translator.
 */
export function translateDict(
  dict: Record<string, string>,
  fallback: Record<string, string>,
  key: string,
  params?: Record<string, unknown>,
): string | undefined {
  const raw = dict[key] ?? fallback[key];
  if (raw === undefined) return undefined;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** Provider page status model (drives the row dot + detail Status block). */
export type ProviderStatus = "ready" | "rate-limited" | "auth-error" | "not-configured" | "not-in-chain" | "unreachable";

/**
 * Status override from a connection-test result. A test that failed is NOT
 * automatically an auth error — `fetch failed` is usually a network problem.
 * Only an explicit auth/rate-limit classification overrides the static guess.
 * @returns the override status, or undefined when the test does not change it.
 */
export function testOutcomeStatus(testResult?: { ok: boolean; error?: { code?: string } }): ProviderStatus | undefined {
  if (!testResult || testResult.ok) return undefined;
  const code = testResult.error?.code ?? "";
  if (code === "auth" || code === "401" || code === "403") return "auth-error";
  if (code === "rate-limit" || code === "quota" || code === "429") return "rate-limited";
  // network / timeout / server / config / bad-request → the provider itself
  // may be fine; the failure is about reachability, not credentials.
  return "unreachable";
}

export function providerStatusOf(p: ProviderView, quota?: QuotaView, inChain = true): ProviderStatus {
  if (!inChain) return "not-in-chain";
  const selfHosted = p.name === "searxng";
  // Self-hosted providers (SearXNG) are configured by an explicit instance
  // base URL, NOT by an API key — the adapter default URL does not count.
  const configured = selfHosted ? p.baseUrlConfigured === true : p.keyConfigured;
  if (!configured) return "not-configured";
  const note = (quota?.note ?? "").toLowerCase();
  if (note.includes("auth") || note.includes("401") || note.includes("403") || note.includes("invalid key")) return "auth-error";
  // rate-limited only when the snapshot is meaningful: remaining 0 with a REAL
  // limit (limit > 0). Brave's "49, 0" header (per-second, monthly-0) parses
  // to remaining 0 / limit 0 — that is a window with no quota info, not
  // exhaustion, so it must NOT flip the provider to rate-limited.
  if (quota?.remaining === 0 && quota?.limit !== undefined && quota?.limit > 0) return "rate-limited";
  // A note is rate-limit evidence ONLY when it states exhaustion ("429",
  // "rate limit exceeded"); "From Brave rate-limit response headers" merely
  // describes the quota source and must not flip a healthy provider.
  if (note.includes("429") || note.includes("rate limit exceeded") || note.includes("quota exceeded")) return "rate-limited";
  return "ready";
}

/**
 * Quota display model — five kinds, each rendered honestly:
 *  - remaining_of_limit : countable remaining+limit (credits/requests/tokens)
 *                         → progress bar allowed (only when remaining ≤ limit)
 *  - balance            : money balance without a limit (usd_cents) → number only
 *  - observed_usage     : local usage recording (Exa) → number + since
 *  - rate_limit         : rate-limit headers (Brave/Jina) → number only
 *  - unavailable/self_hosted : nothing to show
 */
export type QuotaDisplayKind =
  | "remaining_of_limit"
  | "balance"
  | "observed_usage"
  | "rate_limit"
  | "unlimited"
  | "unavailable"
  | "self_hosted";

export function quotaDisplayKind(q: QuotaView | undefined): QuotaDisplayKind {
  if (!q) return "unavailable";
  if (q.source === "self_hosted") return "self_hosted";
  if (!q.supported) return "unavailable";
  // Brave monthly limit 0 = UNLIMITED (per Brave docs): nothing to measure.
  if (q.limit !== undefined && q.limit === 0 && q.remaining === undefined) return "unlimited";
  if (q.source === "local_estimate") return "observed_usage";
  if (q.source === "response_header") return "rate_limit";
  if (q.unit === "usd_cents") return "balance";
  if (q.unit === "credits" || q.unit === "requests" || q.unit === "tokens") {
    // A real remaining_of_limit needs limit > 0; Brave's monthly-0 header
    // (remaining 0 / limit 0) is a window with no quota info → rate_limit.
    if (q.remaining !== undefined && q.limit !== undefined && q.limit > 0) return "remaining_of_limit";
    if (q.remaining !== undefined) return "rate_limit"; // limit-less countable → window, not balance
  }
  return "unavailable";
}

/** Quota one-line summary, provider-aware (no colors, no layout). */
export function quotaSummary(t: TFunc, quota?: QuotaView): string {
  if (!quota?.supported) return "";
  const q = quota;
  // Brave reports monthly limit 0 as UNLIMITED (per its docs). A snapshot
  // with limit 0 and no remaining must read "Unlimited", never "0 left".
  if (q.limit !== undefined && q.limit === 0 && q.remaining === undefined) return t("quotaUnlimited");
  if (q.unit === "credits" && q.remaining !== undefined) return t("quotaCredits", { r: q.remaining, l: q.limit !== undefined && q.limit > 0 ? q.limit : "?" });
  if (q.unit === "requests" && q.remaining !== undefined) return t("quotaRequests", { r: q.remaining, l: q.limit !== undefined && q.limit > 0 ? ` / ${q.limit}` : "" });
  if (q.unit === "usd_cents" && q.used !== undefined) return t("quotaUsd", { amount: (q.used / 100).toFixed(2) });
  if (q.unit === "usd_cents" && q.remaining !== undefined) return t("quotaUsdRemaining", { amount: (q.remaining / 100).toFixed(2) });
  if (q.unit === "tokens" && q.remaining !== undefined) return t("quotaTokens", { n: q.remaining.toLocaleString() });
  if (q.remaining !== undefined) return `${q.remaining}${q.limit !== undefined && q.limit > 0 ? ` / ${q.limit}` : ""}`;
  return "";
}

/**
 * Remaining-fraction for a progress bar, or undefined when a percentage
 * cannot honestly be computed. Bars are drawn ONLY for countable
 * remaining_of_limit snapshots AND only when remaining ≤ limit — a
 * remaining > limit (e.g. Firecrawl 1,166 / 1,000 plan credits) never gets a
 * fabricated >100% bar.
 * @returns fraction 0..1, or undefined when no bar should be drawn.
 */
export function quotaFraction(q: QuotaView | undefined): number | undefined {
  if (quotaDisplayKind(q) !== "remaining_of_limit") return undefined;
  const remaining = q?.remaining;
  const limit = q?.limit;
  if (remaining === undefined || limit === undefined || limit <= 0) return undefined;
  if (remaining > limit) return undefined; // bonus above plan → number, no bar
  return Math.min(1, Math.max(0, remaining / limit));
}

/** Bar color tier: ok (≥30%), warn (10–30%), danger (<10%). */
export function quotaTier(fraction: number | undefined): "ok" | "warn" | "danger" {
  if (fraction === undefined) return "ok";
  if (fraction < 0.1) return "danger";
  if (fraction < 0.3) return "warn";
  return "ok";
}

/** Human "remaining" label, e.g. "823 / 1,000 credits". */
export function quotaRemainingLabel(t: TFunc, q: QuotaView | undefined): string {
  if (!q?.supported || q.remaining === undefined) return "";
  if (q.unit === "credits" && q.limit !== undefined && q.limit > 0) return t("quotaCredits", { r: q.remaining.toLocaleString(), l: q.limit.toLocaleString() });
  if (q.unit === "requests" && q.limit !== undefined && q.limit > 0) return t("quotaRequests", { r: q.remaining.toLocaleString(), l: ` / ${q.limit.toLocaleString()}` });
  return quotaSummary(t, q);
}

/** Secondary line for a quota snapshot (plan / since), or "". */
export function quotaMetaLine(t: TFunc, q: QuotaView | undefined): string {
  if (!q) return "";
  const kind = quotaDisplayKind(q);
  if (kind === "remaining_of_limit" && q.remaining !== undefined && q.limit !== undefined && q.remaining > q.limit) {
    return t("quotaOverPlan", { r: q.remaining.toLocaleString(), l: q.limit.toLocaleString() });
  }
  if (kind === "observed_usage" && q.used !== undefined) {
    return t("quotaSince", { amount: (q.used / 100).toFixed(2) });
  }
  // rate_limit / balance: the kind already says it; keep the line clean.
  return "";
}

/** Human-readable attempt outcome (from Host `attempts[].outcome`). */
export function outcomeLabel(t: TFunc, outcome: string): string {
  if (outcome === "success") return t("successOutcome");
  if (outcome.startsWith("failed:")) {
    const code = outcome.slice("failed:".length);
    switch (code) {
      case "auth": return t("authOutcome");
      case "rate-limit": return t("rateLimitedOutcome");
      case "quota": return t("rateLimitedOutcome");
      case "timeout": return t("timeoutOutcome");
      case "network": return t("networkOutcome");
      case "server": return t("serverOutcome");
      case "aborted": return t("abortedOutcome");
      case "config": return t("configOutcome");
      case "bad-request": return t("badRequestOutcome");
      case "invalid-response": return t("invalidResponseOutcome");
      default: return code;
    }
  }
  if (outcome.startsWith("skipped-")) return t("unknownOutcome");
  return t("unknownOutcome");
}

/**
 * Format a human-friendly summary of the currently resolved provider execution
 * options for the collapsed Search Experience section.
 */
export function formatProviderOptionsSummary(providerName: string, effective: Record<string, unknown> | undefined): string {
  if (!effective) return "使用推荐设置";
  switch (providerName) {
    case "exa": {
      const type = String(effective.searchType ?? "auto");
      const typeLabel = type === "fast" ? "快速搜索" : type === "instant" ? "极速搜索" : type.startsWith("deep") ? "深度搜索" : "自动搜索";
      const freshness = effective.maxAgeHours === 0 ? "始终刷新" : effective.maxAgeHours === -1 ? "仅使用缓存" : "自动新鲜度";
      return `${typeLabel} · ${freshness}`;
    }
    case "tavily": {
      if (effective.autoParameters) return "自动优化 · 1-2 credits";
      const depth = String(effective.searchDepth ?? "basic");
      if (depth === "advanced") return "高质量 · 2 credits";
      if (depth === "fast") return "快速 · 1 credit";
      if (depth === "ultra-fast") return "极速 · 1 credit";
      return "平衡 · 1 credit";
    }
    case "brave": {
      const pref = String(effective.endpointPreference ?? "auto");
      if (pref === "web-search") return "普通网页搜索";
      return "智能上下文 · 推荐";
    }
    case "you": {
      const ext = String(effective.extractionMode ?? "highlights");
      return ext === "none" ? "简短摘要模式" : "AI 相关片段 · 推荐";
    }
    case "firecrawl": {
      const fresh = effective.fetchMaxAgeMs === 0 ? "始终刷新" : "智能缓存";
      return `正文清洗 · ${fresh}`;
    }
    case "parallel": {
      const mode = String(effective.mode ?? "advanced");
      if (mode === "basic") return "平衡模式";
      if (mode === "fast") return "快速模式";
      if (mode === "turbo") return "极速模式";
      return "高质量搜索 · 推荐";
    }
    default:
      return "推荐设置";
  }
}
