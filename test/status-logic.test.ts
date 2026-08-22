/**
 * dsh-web-tools — client status/summary logic tests (plain node, no tsx).
 *
 * Verifies the provider state model that drives the settings-page dots:
 * unconfigured providers must NEVER show as ready (green), and self-hosted
 * SearXNG requires an EXPLICIT base URL — the adapter default does not count.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  providerStatusOf,
  testOutcomeStatus,
  quotaSummary,
  outcomeLabel,
  quotaFraction,
  quotaTier,
  quotaDisplayKind,
  resolveUiLanguage,
  translateDict,
  QUOTA_SOURCE_LABEL_KEY,
  quotaSourceLabel,
} from "../src/client/logic.ts";
import { zhDict, enDict } from "../src/client/i18n-dict.ts";
import type { QuotaSource } from "../src/host/quota.ts";

function provider(overrides: Partial<Parameters<typeof providerStatusOf>[0]> = {}) {
  return {
    name: "tavily",
    label: "Tavily",
    description: "",
    enabled: true,
    credRef: "WEB_TOOLS_TAVILY",
    keyConfigured: false,
    keyWritable: true,
    poolSize: 0,
    ...overrides,
  };
}

test("keyless provider with no key is NOT configured (not ready)", () => {
  const p = provider();
  assert.equal(providerStatusOf(p, undefined, true), "not-configured");
});

test("provider with a configured key is ready", () => {
  const p = provider({ keyConfigured: true });
  assert.equal(providerStatusOf(p, undefined, true), "ready");
});

test("provider outside the order reports not-in-order even when configured", () => {
  const p = provider({ keyConfigured: true });
  assert.equal(providerStatusOf(p, undefined, false), "not-in-order");
});

test("SearXNG with NO explicit base URL is NOT configured (adapter default does not count)", () => {
  const p = provider({
    name: "searxng",
    label: "SearXNG",
    baseUrl: "http://127.0.0.1:8080", // adapter default only
    baseUrlConfigured: false,
    keyConfigured: false,
  });
  assert.equal(providerStatusOf(p, undefined, true), "not-configured", "default URL must not count as configured");
});

test("SearXNG with an EXPLICIT base URL is ready", () => {
  const p = provider({
    name: "searxng",
    label: "SearXNG",
    baseUrl: "https://search.example.com",
    baseUrlConfigured: true,
    keyConfigured: false,
  });
  assert.equal(providerStatusOf(p, undefined, true), "ready");
});

test("auth note flips status to auth-error", () => {
  const p = provider({ keyConfigured: true });
  const quota = { supported: true, authoritative: true, unit: "credits", remaining: 900, source: "api", note: "invalid api key (401)" };
  assert.equal(providerStatusOf(p, quota, true), "auth-error");
});

test("zero remaining quota is rate-limited, not ready", () => {
  const p = provider({ keyConfigured: true });
  const quota = { supported: true, authoritative: true, unit: "credits", remaining: 0, limit: 1000, source: "api" };
  assert.equal(providerStatusOf(p, quota, true), "rate-limited");
});

test("Brave-style header (remaining 0 / limit 0) is NOT rate-limited — no quota info, not exhaustion", () => {
  const p = provider({ keyConfigured: true });
  const quota = { supported: true, authoritative: true, unit: "requests", remaining: 0, limit: 0, source: "response_header" };
  assert.equal(providerStatusOf(p, quota, true), "ready", "limit-0 window must not flip to rate-limited");
  assert.equal(quotaDisplayKind(quota), "rate_limit", "limit-0 window is a window, not remaining_of_limit");
});

test("healthy Brave with captured headers (note mentions rate-limit source) stays ready", () => {
  const p = provider({ keyConfigured: true });
  const quota = {
    supported: true, authoritative: true, unit: "requests",
    remaining: 900, limit: 1000, source: "response_header",
    note: "From Brave rate-limit response headers",
  };
  assert.equal(providerStatusOf(p, quota, true), "ready", "source-describing note must not flip to rate-limited");
});

test("note stating exhaustion (429 / rate limit exceeded) flips to rate-limited", () => {
  const p = provider({ keyConfigured: true });
  assert.equal(
    providerStatusOf(p, { supported: true, authoritative: true, unit: "credits", remaining: 0, limit: 1000, source: "api", note: "Tavily rate limit exceeded (HTTP 429)" }, true),
    "rate-limited",
  );
});

test("quotaSummary formats credits / usd / tokens via the t() template", () => {
  const t = (key: string, params?: unknown) => {
    const map: Record<string, string> = {
      quotaCredits: "{r} / {l} credits",
      quotaRequests: "{r} requests{l}",
      quotaUsd: "${amount} used",
      quotaTokens: "{n} tokens",
    };
    let out = map[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params as Record<string, unknown>)) out = out.replace(`{${k}}`, String(v));
    return out;
  };
  assert.equal(
    quotaSummary(t as never, { supported: true, authoritative: true, unit: "credits", remaining: 823, limit: 1000, source: "api" }),
    "823 / 1000 credits",
  );
  assert.equal(
    quotaSummary(t as never, { supported: true, authoritative: true, unit: "usd_cents", used: 127, source: "api" }),
    "$1.27 used",
  );
  assert.equal(
    quotaSummary(t as never, { supported: true, authoritative: true, unit: "tokens", remaining: 8200000, source: "api" }),
    "8,200,000 tokens",
  );
  assert.equal(quotaSummary(t as never, { supported: false, authoritative: false, unit: "unknown", source: "dashboard" }), "");
  // Brave monthly limit 0 = unlimited → "Unlimited", never "0 left"
  const tUnlimited = (key: string) => ({ quotaUnlimited: "Unlimited" }[key] ?? key);
  assert.equal(
    quotaSummary(tUnlimited as never, { supported: true, authoritative: true, unit: "requests", remaining: undefined, limit: 0, source: "response_header" }),
    "Unlimited",
  );
});

test("outcomeLabel maps raw Host outcomes to human copy keys", () => {
  const t = (key: string) => `[${key}]`;
  assert.equal(outcomeLabel(t, "success"), "[successOutcome]");
  assert.equal(outcomeLabel(t, "failed:rate-limit"), "[rateLimitedOutcome]");
  assert.equal(outcomeLabel(t, "failed:auth"), "[authOutcome]");
  assert.equal(outcomeLabel(t, "failed:timeout"), "[timeoutOutcome]");
  assert.equal(outcomeLabel(t, "skipped-no-keys"), "[unknownOutcome]");
  assert.equal(outcomeLabel(t, "failed:something-weird"), "something-weird");
});

test("quotaFraction draws a bar ONLY for countable remaining/limit units", () => {
  const q = (over: Partial<Parameters<typeof quotaFraction>[0]> = {}) => ({
    supported: true,
    authoritative: true,
    unit: "credits",
    remaining: 823,
    limit: 1000,
    source: "api",
    fetchedAt: Date.now(),
    ...over,
  } as const);
  // credits with remaining+limit → bar
  assert.equal(quotaFraction(q()), 0.823);
  // requests with remaining+limit → bar
  assert.equal(quotaFraction(q({ unit: "requests", remaining: 943, limit: 1000 })), 0.943);
  // tokens with remaining+limit → bar
  assert.equal(quotaFraction(q({ unit: "tokens", remaining: 8200000, limit: 10000000 })), 0.82);
  // usd balance with NO limit → NO bar (must not fabricate a percentage)
  assert.equal(quotaFraction(q({ unit: "usd_cents", remaining: 8342, limit: undefined })), undefined);
  // usd with a limit is still not a countable quota → NO bar
  assert.equal(quotaFraction(q({ unit: "usd_cents", remaining: 8342, limit: 10000 })), undefined);
  // unsupported (dashboard-only) → NO bar
  assert.equal(quotaFraction(q({ supported: false, unit: "unknown" })), undefined);
  // missing remaining → NO bar
  assert.equal(quotaFraction(q({ remaining: undefined })), undefined);
  // limit 0 → NO bar (division guard)
  assert.equal(quotaFraction(q({ limit: 0 })), undefined);
  // remaining > limit (bonus above plan, e.g. Firecrawl 1,166/1,000) → NO bar
  assert.equal(quotaFraction(q({ remaining: 1166, limit: 1000 })), undefined, "over-plan must not draw a >100% bar");
});

test("quotaDisplayKind classifies the honest display kinds", () => {
  const q = (over: Record<string, unknown> = {}) => ({
    supported: true,
    authoritative: true,
    unit: "credits",
    remaining: 823,
    limit: 1000,
    source: "api",
    fetchedAt: Date.now(),
    ...over,
  } as never);
  assert.equal(quotaDisplayKind(q()), "remaining_of_limit");
  assert.equal(quotaDisplayKind(q({ unit: "usd_cents", remaining: 8342, limit: undefined })), "balance");
  assert.equal(quotaDisplayKind(q({ unit: "requests", remaining: 943, limit: undefined, source: "response_header" })), "rate_limit");
  assert.equal(quotaDisplayKind(q({ unit: "usd_cents", remaining: 38, source: "local_estimate" })), "observed_usage");
  assert.equal(quotaDisplayKind(q({ supported: false, source: "dashboard", unit: "unknown" })), "unavailable");
  assert.equal(quotaDisplayKind(q({ source: "self_hosted", unit: "unknown" })), "self_hosted");
  // Brave monthly limit 0 = UNLIMITED per its docs → distinct kind, never "0 left"
  assert.equal(quotaDisplayKind(q({ unit: "requests", remaining: undefined, limit: 0, source: "response_header" })), "unlimited");
  assert.equal(quotaDisplayKind(undefined), "unavailable");
});

test("quotaTier thresholds: ok ≥20%, warn 5–20%, danger <5%", () => {
  assert.equal(quotaTier(0.9), "ok");
  assert.equal(quotaTier(0.2), "ok");
  assert.equal(quotaTier(0.19), "warn");
  assert.equal(quotaTier(0.05), "warn");
  assert.equal(quotaTier(0.04), "danger");
  assert.equal(quotaTier(0), "danger");
  assert.equal(quotaTier(undefined), "ok");
});

test("testOutcomeStatus: no result or ok result does not override status", () => {
  assert.equal(testOutcomeStatus(undefined), undefined);
  assert.equal(testOutcomeStatus({ ok: true }), undefined);
});

test("testOutcomeStatus: network fetch failed is unreachable, NOT auth-error", () => {
  assert.equal(testOutcomeStatus({ ok: false, error: { code: "network", message: "fetch failed" } }), "unreachable");
  assert.equal(testOutcomeStatus({ ok: false, error: { code: "timeout" } }), "unreachable");
  assert.equal(testOutcomeStatus({ ok: false, error: { code: "server" } }), "unreachable");
});

test("testOutcomeStatus: auth and rate-limit classifications still override", () => {
  assert.equal(testOutcomeStatus({ ok: false, error: { code: "auth" } }), "auth-error");
  assert.equal(testOutcomeStatus({ ok: false, error: { code: "401" } }), "auth-error");
  assert.equal(testOutcomeStatus({ ok: false, error: { code: "rate-limit" } }), "rate-limited");
  assert.equal(testOutcomeStatus({ ok: false, error: { code: "quota" } }), "rate-limited");
});

// ---- page UI language (independent of the DSH-wide locale) ----

test("resolveUiLanguage: forced zh/en win; auto follows the DSH locale", () => {
  assert.equal(resolveUiLanguage("zh", "en"), "zh", "forced zh beats DSH en");
  assert.equal(resolveUiLanguage("en", "zh"), "en", "forced en beats DSH zh");
  assert.equal(resolveUiLanguage("auto", "en"), "en");
  assert.equal(resolveUiLanguage("auto", "zh"), "zh");
  assert.equal(resolveUiLanguage(undefined, "en"), "en", "absent pref = auto");
  assert.equal(resolveUiLanguage(undefined, "zh"), "zh");
  assert.equal(resolveUiLanguage(undefined, "fr"), "zh", "unknown DSH locale falls back to zh");
  assert.equal(resolveUiLanguage("auto", "fr"), "zh");
});

test("translateDict: picks the active dict, falls back cross-locale, substitutes params", () => {
  const zh = { greeting: "你好，{name}！", onlyZh: "仅中文" };
  const en = { greeting: "Hello, {name}!", onlyEn: "English only" };
  assert.equal(translateDict(en, zh, "greeting", { name: "Tom" }), "Hello, Tom!");
  assert.equal(translateDict(zh, en, "greeting", { name: "小明" }), "你好，小明！");
  // cross-locale fallback for keys missing in the active dict
  assert.equal(translateDict(en, zh, "onlyZh"), "仅中文");
  assert.equal(translateDict(zh, en, "onlyEn"), "English only");
  // no params → raw template; missing key → undefined
  assert.equal(translateDict(en, zh, "greeting"), "Hello, {name}!");
  assert.equal(translateDict(en, zh, "missing"), undefined);
  assert.equal(translateDict(zh, en, "missing", { name: "x" }), undefined);
});

// ---- QuotaSource exhaustive mapping & release gate tests ----

test("QUOTA_SOURCE_LABEL_KEY maps every QuotaSource to a valid dictionary key in both zh and en", () => {
  const sources: QuotaSource[] = [
    "api",
    "response_header",
    "best_effort_api",
    "local_estimate",
    "dashboard",
    "self_hosted",
  ];

  for (const s of sources) {
    const key = QUOTA_SOURCE_LABEL_KEY[s];
    assert.ok(key, `QuotaSource "${s}" must have a defined label key`);
    assert.ok(key in zhDict, `Key "${key}" for QuotaSource "${s}" must exist in zhDict`);
    assert.ok(key in enDict, `Key "${key}" for QuotaSource "${s}" must exist in enDict`);
    assert.ok(!zhDict[key].includes("quotaSource"), `zh translation for "${key}" must not leak key name`);
    assert.ok(!enDict[key].includes("quotaSource"), `en translation for "${key}" must not leak key name`);
  }
});

test("quotaSourceLabel safely translates any QuotaSource and never outputs raw keys", () => {
  const tZh = (k: string, ...args: unknown[]) => translateDict(zhDict, enDict, k, args[0] as Record<string, unknown>) ?? k;
  const tEn = (k: string, ...args: unknown[]) => translateDict(enDict, zhDict, k, args[0] as Record<string, unknown>) ?? k;

  assert.equal(quotaSourceLabel(tZh, "best_effort_api"), zhDict.quotaSourceBestEffortApi);
  assert.ok(!quotaSourceLabel(tZh, "best_effort_api").includes("quotaSourceBest_effort_api"));
  assert.equal(quotaSourceLabel(tEn, "best_effort_api"), enDict.quotaSourceBestEffortApi);
  assert.ok(!quotaSourceLabel(tEn, "best_effort_api").includes("quotaSourceBest_effort_api"));
  assert.equal(quotaSourceLabel(tZh, "response_header"), zhDict.quotaSourceResponseHeader);
  assert.equal(quotaSourceLabel(tZh, "api"), zhDict.quotaSourceApi);
  assert.equal(quotaSourceLabel(tZh, "local_estimate"), zhDict.quotaSourceLocalEstimate);
  assert.equal(quotaSourceLabel(tZh, "dashboard"), zhDict.quotaSourceDashboard);
  assert.equal(quotaSourceLabel(tZh, "self_hosted"), zhDict.quotaSourceSelfHosted);
});

test("forbidden marketing copy audit: zhDict contains no banned terms", () => {
  const bannedTerms = [
    "智能匹配",
    "智能判定",
    "智能去除",
    "智能",
    "高质量",
    "适合深度研究",
    "适合简单事实",
    "~1s",
    "~4s",
    "<1s",
    "极速返回",
    "多层语义解析",
    "多源内容深度递归",
    "广告",
  ];

  for (const [key, val] of Object.entries(zhDict)) {
    for (const banned of bannedTerms) {
      assert.ok(!val.includes(banned), `zhDict[${key}] = "${val}" contains forbidden term "${banned}"`);
    }
  }
});

