/**
 * dsh-web-tools — client status/summary logic tests (plain node, no tsx).
 *
 * Verifies the provider state model that drives the settings-page dots:
 * unconfigured providers must NEVER show as ready (green), and self-hosted
 * SearXNG requires an EXPLICIT base URL — the adapter default does not count.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { providerStatusOf, testOutcomeStatus, quotaSummary, outcomeLabel, quotaFraction, quotaTier, quotaDisplayKind } from "../src/client/logic.ts";

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

test("provider outside the chain reports not-in-chain even when configured", () => {
  const p = provider({ keyConfigured: true });
  assert.equal(providerStatusOf(p, undefined, false), "not-in-chain");
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

test("quotaDisplayKind classifies the five honest display kinds", () => {
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
  assert.equal(quotaDisplayKind(undefined), "unavailable");
});

test("quotaTier thresholds: ok ≥30%, warn 10–30%, danger <10%", () => {
  assert.equal(quotaTier(0.9), "ok");
  assert.equal(quotaTier(0.3), "ok");
  assert.equal(quotaTier(0.29), "warn");
  assert.equal(quotaTier(0.1), "warn");
  assert.equal(quotaTier(0.09), "danger");
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
