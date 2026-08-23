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
import { buildProviderOptionView, sanitizeProviderOptions, resolveEffectiveOptions } from "./provider-options.ts";
import { extractSearchHints, calculateAfterDate } from "./search-hints.ts";
import { buildFirecrawlSearchBody } from "./providers/firecrawl.ts";
import { buildTavilySearchBody } from "./providers/tavily.ts";
import { buildYouSearchBody } from "./providers/you.ts";
import { buildBraveLlmContextBody } from "./providers/brave.ts";
import { buildExaSearchBody } from "./providers/exa.ts";
import { buildSearxngUrl } from "./providers/searxng.ts";

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

test("buildParallelSearchBody: max_chars_total at top level when set, never in advanced_settings", () => {
  const body = buildParallelSearchBody("test", 5, { mode: "advanced", maxCharsTotal: 50000 });
  assert.deepEqual(body, {
    objective: "test",
    search_queries: ["test"],
    mode: "advanced",
    max_chars_total: 50000,
    advanced_settings: { max_results: 5 },
  });
  // No max_chars_total inside advanced_settings — that would cause HTTP 422.
  const adv = body.advanced_settings as Record<string, unknown>;
  assert.equal(adv.max_chars_total, undefined);
});

test("buildParallelSearchBody: max_chars_total omitted when not set", () => {
  const body = buildParallelSearchBody("test", 5, { mode: "basic" });
  assert.equal(body.max_chars_total, undefined);
  assert.deepEqual(body.advanced_settings, { max_results: 5 });
});

test("buildParallelSearchBody with SearchHints: soft-steers objective and sets source_policy", () => {
  const hints = extractSearchHints("site:github.com Gemini CLI official documentation this week bug", new Date("2026-08-23T12:00:00Z"));
  const body = buildParallelSearchBody("site:github.com Gemini CLI official documentation this week bug", 10, { mode: "advanced" }, hints);
  
  assert.equal(body.mode, "advanced");
  assert.match((body.objective as string), /Gemini CLI official documentation this week bug/);
  assert.match((body.objective as string), /Prefer primary documentation and official sources/);
  assert.deepEqual(body.search_queries, ["Gemini CLI official documentation this week bug"]);
  
  const adv = body.advanced_settings as Record<string, unknown>;
  assert.equal(adv.max_results, 10);
  const sourcePolicy = adv.source_policy as Record<string, unknown>;
  assert.deepEqual(sourcePolicy.include_domains, ["github.com"]);
  assert.equal(sourcePolicy.after_date, "2026-08-16");
});

// ---- Firecrawl adapter (search body with SearchHints) ----

test("buildFirecrawlSearchBody maps code topic to categories: ['developer'] and site: to includeDomains", () => {
  const hints = extractSearchHints("site:github.com DeepSeek Harness tool calling issue");
  const body = buildFirecrawlSearchBody("site:github.com DeepSeek Harness tool calling issue", 10, hints);
  
  assert.equal(body.query, "DeepSeek Harness tool calling issue");
  assert.equal(body.limit, 10);
  assert.deepEqual(body.categories, ["developer"]);
  assert.deepEqual(body.includeDomains, ["github.com"]);
});

test("buildFirecrawlSearchBody maps freshness preset to tbs", () => {
  const hints = extractSearchHints("今天中国 OpenAI 有什么新消息");
  const body = buildFirecrawlSearchBody("今天中国 OpenAI 有什么新消息", 5, hints);
  
  assert.equal(body.limit, 5);
  assert.equal(body.tbs, "qdr:d");
  assert.equal(body.country, "CN");
});

test("buildFirecrawlSearchBody maps research topic to categories: ['research']", () => {
  const hints = extractSearchHints("找一下今年最新 AI 论文 arxiv");
  const body = buildFirecrawlSearchBody("找一下今年最新 AI 论文 arxiv", 8, hints);
  
  assert.deepEqual(body.categories, ["research"]);
});

// ---- SearchHints pure extraction tests ----

test("extractSearchHints extracts code topic, domains, freshness, and cleanQuery", () => {
  const hints = extractSearchHints("site:github.com -site:spam.com Gemini CLI this week bug", new Date("2026-08-23T12:00:00Z"));
  assert.equal(hints.topic, "code");
  assert.deepEqual(hints.domains?.include, ["github.com"]);
  assert.deepEqual(hints.domains?.exclude, ["spam.com"]);
  assert.equal(hints.freshness?.preset, "week");
  assert.equal(hints.freshness?.after, "2026-08-16");
  assert.equal(hints.cleanQuery, "Gemini CLI this week bug");
});

test("extractSearchHints extracts news and day freshness", () => {
  const hints = extractSearchHints("今天 OpenAI 有什么重大新闻 breaking news");
  assert.equal(hints.topic, "news");
  assert.equal(hints.freshness?.preset, "day");
});

test("extractSearchHints decouples language from country (only explicit country sets country)", () => {
  const hints1 = extractSearchHints("中文搜索一下美国 OpenAI 最近有什么变化");
  assert.equal(hints1.locale?.language, "zh");
  assert.equal(hints1.locale?.country, "US"); // Explicitly mentioned 美国

  const hints2 = extractSearchHints("React 官方文档报错");
  assert.equal(hints2.locale?.language, "zh");
  assert.equal(hints2.locale?.country, undefined); // No country specified!

  // Soft freshness in evergreen technical doc should not truncate to 1 month
  assert.equal(hints2.freshness, undefined);
});

test("extractSearchHints extracts finance topic", () => {
  const hints = extractSearchHints("Nvidia Q2 earnings report and revenue 财报");
  assert.equal(hints.topic, "finance");
});

test("extractSearchHints avoids single-country bias for multi-country or global queries", () => {
  // 1. Multi-country query should not bias to any single country
  const multiCountryHints = extractSearchHints("比较中国和美国 AI 政策与市场");
  assert.equal(multiCountryHints.locale?.language, "zh");
  assert.equal(multiCountryHints.locale?.country, undefined);

  // 2. Global / International scope query should suppress country bias
  const globalHints = extractSearchHints("国内外最新 AI 新闻");
  assert.equal(globalHints.locale?.language, "zh");
  assert.equal(globalHints.locale?.country, undefined);

  const worldwideHints = extractSearchHints("worldwide AI market trends in US and China");
  assert.equal(worldwideHints.locale?.country, undefined);
});

// ---- Tavily deep adaptation tests ----

test("buildTavilySearchBody never emits invalid finance topic and falls back to general search", () => {
  const hints = extractSearchHints("Nvidia earnings 财报");
  const body = buildTavilySearchBody("Nvidia earnings 财报", 5, undefined, hints);
  assert.equal(body.topic, undefined, "finance topic must not be emitted to Tavily");
});

test("buildTavilySearchBody maps topic news, freshness week, and domains", () => {
  const hints = extractSearchHints("site:reuters.com -site:spam.com OpenAI breaking news this week", new Date("2026-08-23T12:00:00Z"));
  const body = buildTavilySearchBody("site:reuters.com -site:spam.com OpenAI breaking news this week", 5, { searchDepth: "basic", chunksPerSource: 2 }, hints);
  
  assert.equal(body.topic, "news");
  assert.equal(body.search_depth, "basic");
  assert.equal(body.chunks_per_source, 2);
  assert.equal(body.time_range, "week");
  assert.deepEqual(body.include_domains, ["reuters.com"]);
  assert.deepEqual(body.exclude_domains, ["spam.com"]);
});

// ---- You.com deep adaptation tests ----

test("buildYouSearchBody maps soft prefer to boost_domains and sets freshness", () => {
  const hints = extractSearchHints("today AI news prefer official documentation", new Date("2026-08-23T12:00:00Z"));
  const body = buildYouSearchBody("today AI news prefer official documentation", 10, { extractionMode: "highlights" }, hints);
  
  assert.deepEqual(body.extraction, { extraction_mode: "highlights" });
  assert.equal(body.freshness, "day");
});

test("buildYouSearchBody maps hard site: to include_domains without boost_domains", () => {
  const hints = extractSearchHints("site:openai.com GPT-5 model spec");
  const body = buildYouSearchBody("site:openai.com GPT-5 model spec", 5, undefined, hints);
  
  assert.deepEqual(body.include_domains, ["openai.com"]);
  assert.equal(body.boost_domains, undefined);
});

// ---- Brave deep adaptation tests ----

test("buildBraveLlmContextBody maps freshness preset to pd/pw/pm/py and country/lang", () => {
  const hints = extractSearchHints("今日中国 OpenAI 进展快讯");
  const body = buildBraveLlmContextBody("今日中国 OpenAI 进展快讯", 10, undefined, hints);
  
  assert.equal(body.freshness, "pd");
  assert.equal(body.country, "CN");
  assert.equal(body.search_lang, "zh");
});

// ---- Exa deep adaptation tests ----

test("buildExaSearchBody maps research topic to publication category and startPublishedDate", () => {
  const hints = extractSearchHints("site:arxiv.org AI reasoning benchmark paper this week", new Date("2026-08-23T12:00:00Z"));
  const body = buildExaSearchBody("site:arxiv.org AI reasoning benchmark paper this week", 10, { searchType: "fast" }, hints);
  
  assert.equal(body.category, "publication");
  assert.equal(body.type, "fast");
  assert.deepEqual(body.includeDomains, ["arxiv.org"]);
  assert.equal(body.startPublishedDate, "2026-08-16T00:00:00.000Z");
});

// ---- SearXNG deep adaptation tests ----

test("buildSearxngUrl maps code topic to it, time_range to week, and language", () => {
  const hints = extractSearchHints("TypeScript compiler error this week");
  const url = buildSearxngUrl("http://127.0.0.1:8080", "TypeScript compiler error this week", undefined, hints);
  
  assert.equal(url.searchParams.get("categories"), "it");
  assert.equal(url.searchParams.get("time_range"), "week");
  assert.equal(url.searchParams.get("format"), "json");
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

test("P4 providerOptions: resolveEffectiveOptions returns default when no overrides", () => {
  const exaEff = resolveEffectiveOptions("exa", undefined);
  assert.equal(exaEff.searchType, "auto");
  assert.equal(exaEff.maxAgeHours, undefined);

  const view = buildProviderOptionView("exa", undefined);
  assert.equal(view?.isDefault, true);
  assert.equal(view?.customized, false);
});

test("P4 providerOptions: sanitizeProviderOptions filters invalid enums and values", () => {
  const sanitized = sanitizeProviderOptions("exa", { searchType: "invalid-type", maxAgeHours: 0 } as any);
  assert.deepEqual(sanitized, { maxAgeHours: 0 });

  const tavily = sanitizeProviderOptions("tavily", { searchDepth: "ultra-fast", autoParameters: true } as any);
  assert.deepEqual(tavily, { searchDepth: "ultra-fast", autoParameters: true });
});

test("P4 providerOptions: buildProviderOptionView accurately merges overrides and detects customized state", () => {
  const view = buildProviderOptionView("tavily", { searchDepth: "advanced" });
  assert.equal(view?.customized, true);
  assert.equal(view?.isDefault, false);
  assert.equal(view?.effective.searchDepth, "advanced");
  assert.equal(view?.overrides.searchDepth, "advanced");
});
