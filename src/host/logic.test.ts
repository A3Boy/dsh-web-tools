/**
 * Unit tests for pool + fallback pure logic.
 * Run: node --experimental-strip-types --test src/host/*.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildPool, selectIndex, markUsed, markUnhealthy, resetHealth, hintOf, reserveKey, releaseKey } from "./pool.ts";
import { classifyFailure, fallbackChain } from "./fallback.ts";
import { parseJinaBalance, parseJinaSearchJson } from "./providers/jina.ts";
import {
  buildParallelSearchBody,
  clampParallelCount,
  normalizeParallelQuery,
  parseParallelExtractText,
  parseParallelSearchResults,
} from "./providers/parallel.ts";
import { braveQuotaFromHeaders } from "./providers/brave.ts";
import { classifyHttpStatus } from "./providers/types.ts";
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

// ---- Parallel adapter (search body / result normalization / extract) ----

test("clampParallelCount: undefined→5, floor 1, cap 20", () => {
  assert.equal(clampParallelCount(undefined), 5);
  assert.equal(clampParallelCount(0), 1);
  assert.equal(clampParallelCount(-3), 1);
  assert.equal(clampParallelCount(99), 20);
  assert.equal(clampParallelCount(8), 8);
});

test("normalizeParallelQuery: collapses whitespace and caps at 200 chars", () => {
  assert.equal(normalizeParallelQuery("  what   is\ndsh\n  "), "what is dsh");
  const long = "x".repeat(500);
  assert.equal(normalizeParallelQuery(long).length, 200);
});

test("buildParallelSearchBody: objective + one query + mode advanced + clamped max_results", () => {
  const body = buildParallelSearchBody("  DeepSeek   Harness \n release ", 10);
  assert.deepEqual(body, {
    objective: "  DeepSeek   Harness \n release ",
    search_queries: ["DeepSeek Harness release"],
    mode: "advanced",
    advanced_settings: { max_results: 10 },
  });
  // objective keeps the raw query verbatim — only search_queries is normalized
  assert.equal((body as { objective: string }).objective.includes("  "), true);
});

test("parseParallelSearchResults: normalizes url/title/excerpts/publish_date", () => {
  const body = {
    results: [
      {
        url: "https://example.com/a",
        title: "Result A",
        publish_date: "2026-01-15",
        excerpts: ["First passage.", "Second passage."],
      },
      { url: "https://example.com/b" },
    ],
  };
  assert.deepEqual(parseParallelSearchResults(body, 5), [
    {
      url: "https://example.com/a",
      title: "Result A",
      snippet: "First passage.\n\nSecond passage.",
      publishedAt: "2026-01-15",
    },
    { url: "https://example.com/b" },
  ]);
});

test("parseParallelSearchResults: skips url-less items, respects the cap, caps the snippet", () => {
  const body = {
    results: [
      { title: "no url" },
      { url: "https://a.example/" },
      { url: "https://b.example/", excerpts: ["x".repeat(600)] },
      { url: "https://c.example/" },
      null,
      { url: "" },
    ],
  };
  const sources = parseParallelSearchResults(body, 2);
  assert.equal(sources.length, 2, "cap applies after skipping invalid items");
  assert.equal(sources[0].url, "https://a.example/");
  assert.equal(sources[1].snippet?.length, 500, "joined excerpts capped at 500 chars");
});

test("parseParallelSearchResults: malformed envelopes yield no sources", () => {
  assert.deepEqual(parseParallelSearchResults(null, 5), []);
  assert.deepEqual(parseParallelSearchResults({}, 5), []);
  assert.deepEqual(parseParallelSearchResults({ results: "nope" }, 5), []);
});

test("parseParallelExtractText: full_content wins, excerpts are the fallback", () => {
  assert.equal(
    parseParallelExtractText({ results: [{ full_content: "# Page body", excerpts: ["e"] }] }),
    "# Page body",
  );
  assert.equal(
    parseParallelExtractText({ results: [{ excerpts: ["part one", "part two"] }] }),
    "part one\n\npart two",
  );
  // whitespace-only full_content falls through to excerpts
  assert.equal(parseParallelExtractText({ results: [{ full_content: "   ", excerpts: ["real"] }] }), "real");
});

test("parseParallelExtractText: undefined when nothing usable (caller raises server error)", () => {
  assert.equal(parseParallelExtractText(null), undefined);
  assert.equal(parseParallelExtractText({ results: [] }), undefined);
  assert.equal(parseParallelExtractText({ results: [{}] }), undefined);
  assert.equal(parseParallelExtractText({ results: [{ full_content: "", excerpts: [] }] }), undefined);
});

test("classifyHttpStatus: Parallel's documented codes map onto the closed union", () => {
  assert.equal(classifyHttpStatus(401), "auth");
  assert.equal(classifyHttpStatus(402), "quota"); // insufficient credits
  assert.equal(classifyHttpStatus(403), "auth");
  assert.equal(classifyHttpStatus(408), "timeout");
  assert.equal(classifyHttpStatus(422), "bad-request"); // validation error
  assert.equal(classifyHttpStatus(429), "rate-limit");
  assert.equal(classifyHttpStatus(500), "server");
  assert.equal(classifyHttpStatus(502), "server");
  assert.equal(classifyHttpStatus(503), "server");
});

test("pool inFlight allocation & reserve/release concurrency control", () => {
  const p = buildPool("k1,k2");
  // initially both inFlight=0, uses=0 -> picks k1 (index 0)
  assert.equal(selectIndex(p), 0);

  // simulate reserving k1 for in-flight request
  reserveKey(p, 0);
  assert.equal(p[0].inFlight, 1);

  // next concurrent request should pick k2 (inFlight=0 < inFlight=1)
  assert.equal(selectIndex(p), 1);
  reserveKey(p, 1);
  assert.equal(p[1].inFlight, 1);

  // when both have inFlight=1, ties break on uses (both 0), then order (0)
  assert.equal(selectIndex(p), 0);

  // simulate request 0 finishes successfully
  releaseKey(p, 0);
  markUsed(p, 0);
  assert.equal(p[0].inFlight, 0);
  assert.equal(p[0].uses, 1);

  // next request picks k1 (inFlight 0 < inFlight 1)
  assert.equal(selectIndex(p), 0);

  // release k2
  releaseKey(p, 1);
  assert.equal(p[1].inFlight, 0);

  // clamp protection: releasing below 0 never produces negative inFlight
  releaseKey(p, 1);
  assert.equal(p[1].inFlight, 0);
});
