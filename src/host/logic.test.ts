/**
 * Unit tests for pool + fallback pure logic.
 * Run: node --experimental-strip-types --test src/host/*.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildPool, selectIndex, markUsed, markUnhealthy, resetHealth, hintOf } from "./pool.ts";
import { classifyFailure, fallbackChain } from "./fallback.ts";
import { parseJinaBalance, parseJinaSearchJson } from "./providers/jina.ts";
import { braveQuotaFromHeaders } from "./providers/brave.ts";
import { mergePoolQuota } from "./quota.ts";

test("buildPool splits on comma/whitespace/newline and dedupes empties", () => {
  const p = buildPool("k1, k2\nk3;k4  ,, k5");
  assert.deepEqual(p.map((e: { key: string }) => e.key), ["k1", "k2", "k3", "k4", "k5"]);
  assert.deepEqual(buildPool(""), []);
  assert.deepEqual(buildPool("  , ; "), []);
});

test("selectIndex picks least-used with fixed tie-break", () => {
  const p = buildPool("a,b,c");
  assert.equal(selectIndex(p), 0);
  markUsed(p, 0);
  markUsed(p, 0);
  markUsed(p, 1);
  // uses: a=2, b=1, c=0 → c
  assert.equal(selectIndex(p), 2);
});

test("selectIndex skips unhealthy keys", () => {
  const p = buildPool("a,b,c");
  markUnhealthy(p, 0);
  markUnhealthy(p, 1);
  assert.equal(selectIndex(p), 2);
});

test("selectIndex throws when all unhealthy or empty", () => {
  const p = buildPool("a,b");
  markUnhealthy(p, 0);
  markUnhealthy(p, 1);
  assert.throws(() => selectIndex(p), /no healthy/);
  assert.throws(() => selectIndex([]), /empty/);
});

test("resetHealth restores the pool", () => {
  const p = buildPool("a,b");
  markUnhealthy(p, 0);
  markUnhealthy(p, 1);
  resetHealth(p);
  assert.equal(selectIndex(p), 0);
});

test("hintOf masks keys", () => {
  const h = hintOf("tvly-dev-ABCDEFGHIJKLMNOP");
  assert.ok(h.startsWith("tvly-"));
  assert.ok(h.endsWith("OP"));
  assert.ok(!h.includes("ABCDEFGHIJKLMNOP"));
});

test("classifyFailure: retryable vs non-retryable vs terminal", () => {
  assert.equal(classifyFailure({ code: "rate-limit" }), "retryable");
  assert.equal(classifyFailure({ code: "timeout" }), "retryable");
  assert.equal(classifyFailure({ code: "server" }), "retryable");
  assert.equal(classifyFailure({ code: "network" }), "retryable");
  assert.equal(classifyFailure({ code: "unavailable" }), "retryable");
  assert.equal(classifyFailure({ code: "auth" }), "retryable"); // bad key → fallback + mark unhealthy
  assert.equal(classifyFailure({ code: "bad-request" }), "non-retryable");
  assert.equal(classifyFailure({ code: "config" }), "non-retryable");
  assert.equal(classifyFailure({ code: "mystery" }), "retryable");
  // caller cancellation terminates the whole chain — never fallback
  assert.equal(classifyFailure({ code: "aborted" }), "terminal");
});

test("fallbackChain: dedupes, keeps full order (no artificial cap)", () => {
  const chain = fallbackChain({
    defaultProvider: "tavily",
    fallbackOrder: ["exa", "tavily", "firecrawl", "searxng"],
  });
  assert.deepEqual(chain, ["tavily", "exa", "firecrawl", "searxng"]);
  assert.deepEqual(fallbackChain({ defaultProvider: "tavily", fallbackOrder: [] }), ["tavily"]);
});

test("parseJinaBalance: finds the Balance left line", () => {
  const sample = [
    "Title: Jina Reader",
    "",
    "[Balance left: 8,211,345]",
    "",
    "Some content here",
  ].join("\n");
  assert.equal(parseJinaBalance(sample), 8211345);
});

test("parseJinaBalance: undefined on format change (never breaks search)", () => {
  assert.equal(parseJinaBalance("no balance info here"), undefined);
  assert.equal(parseJinaBalance("Balance: 100"), undefined); // no "left" keyword
  assert.equal(parseJinaBalance(""), undefined);
});

test("parseJinaSearchJson: normalizes the official { data: [...] } envelope", () => {
  const body = {
    code: 200,
    status: 20000,
    data: [
      {
        title: "Example Domain",
        description: "This domain is for use in illustrative examples.",
        url: "https://example.com/",
        content: "full page text…",
        publishedTime: "2026-01-01T00:00:00Z",
      },
      {
        title: "Second Result",
        description: "Another snippet",
        url: "https://example.org/",
      },
    ],
  };
  assert.deepEqual(parseJinaSearchJson(body, 5), [
    {
      url: "https://example.com/",
      title: "Example Domain",
      snippet: "This domain is for use in illustrative examples.",
      publishedAt: "2026-01-01T00:00:00Z",
    },
    {
      url: "https://example.org/",
      title: "Second Result",
      snippet: "Another snippet",
    },
  ]);
});

test("parseJinaSearchJson: skips items without a usable url and respects the cap", () => {
  const body = {
    data: [
      { title: "no url here" },
      { url: "https://a.example/" },
      { url: "https://b.example/" },
      { url: "https://c.example/" },
      null,
      { url: "" },
    ],
  };
  // cap 2 → only the first two valid urls; null and empty-url skipped.
  assert.deepEqual(parseJinaSearchJson(body, 2), [
    { url: "https://a.example/" },
    { url: "https://b.example/" },
  ]);
});

test("parseJinaSearchJson: empty/malformed envelopes yield no sources (never throws)", () => {
  assert.deepEqual(parseJinaSearchJson(null, 5), []);
  assert.deepEqual(parseJinaSearchJson({}, 5), []);
  assert.deepEqual(parseJinaSearchJson({ data: "not-an-array" }, 5), []);
  assert.deepEqual(parseJinaSearchJson({ data: [{ title: "no url" }] }, 5), []);
});

test("braveQuotaFromHeaders: reads the monthly window from rate-limit headers", () => {
  const headers = new Headers({
    "x-ratelimit-limit": "1, 15000",
    "x-ratelimit-remaining": "0, 14523",
    "x-ratelimit-reset": "1, 1234567",
  });
  const q = braveQuotaFromHeaders(headers, 1000);
  assert.equal(q.supported, true);
  assert.equal(q.authoritative, true);
  assert.equal(q.unit, "requests");
  assert.equal(q.remaining, 14523);
  assert.equal(q.limit, 15000);
  assert.equal(q.source, "response_header");
  assert.equal(q.fetchedAt, 1000);
});

test("braveQuotaFromHeaders: missing headers → undefined fields, still usable", () => {
  const q = braveQuotaFromHeaders(new Headers(), 0);
  assert.equal(q.remaining, undefined);
  assert.equal(q.limit, undefined);
});

test("mergePoolQuota sums remaining/limit across keys and keeps unit/source", () => {
  const snap = mergePoolQuota([
    { supported: true, authoritative: true, unit: "credits", remaining: 932, limit: 1000, source: "api", fetchedAt: 1, breakdown: { search: 68 } },
    { supported: true, authoritative: true, unit: "credits", remaining: 1000, limit: 1000, source: "api", fetchedAt: 2, breakdown: { search: 0 } },
  ]);
  assert.equal(snap.remaining, 1932);
  assert.equal(snap.limit, 2000);
  assert.equal(snap.unit, "credits");
  assert.equal(snap.source, "api");
  assert.equal(snap.breakdown?.search, 68);
  assert.match(snap.note ?? "", /聚合 2 把 Key/);
});

test("mergePoolQuota single key keeps the original note (no aggregation label)", () => {
  const snap = mergePoolQuota([
    { supported: true, authoritative: true, unit: "credits", remaining: 932, limit: 1000, source: "api", fetchedAt: 1, note: "plan: Researcher" },
  ]);
  assert.equal(snap.remaining, 932);
  assert.equal(snap.limit, 1000);
  assert.equal(snap.note, "plan: Researcher");
});
