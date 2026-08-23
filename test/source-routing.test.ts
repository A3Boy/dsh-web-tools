/**
 * Unit tests for P7.0: Platform Hints Extraction & Specialized Source Routing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSearchHints } from "../src/host/search-hints.ts";
import { buildFallbackQuery, fallbackSearchToGeneralWeb, fallbackFetchToGeneralWeb } from "../src/host/sources/web-fallback.ts";
import { SpecializedSourceRegistry } from "../src/host/sources/registry.ts";
import type { SpecializedSource, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome } from "../src/host/sources/types.ts";
import type { WebSearchProvider, WebFetchProvider } from "../src/host/types.ts";

test("P7.0 extractSearchHints: identifies Xiaohongshu queries and cleans query", () => {
  const hints1 = extractSearchHints("小红书最近 Gemini 3.7 的用户评价");
  assert.equal(hints1.platform, "xiaohongshu");
  assert.equal(hints1.platformExplicit, true);
  assert.equal(hints1.cleanQuery, "最近 Gemini 3.7 的用户评价");

  const hints2 = extractSearchHints("site:xiaohongshu.com 上海周末好去处");
  assert.equal(hints2.platform, "xiaohongshu");
  assert.equal(hints2.platformExplicit, true);
  assert.equal(hints2.cleanQuery, "上海周末好去处");

  const hints3 = extractSearchHints("rednote travel tips for tokyo");
  assert.equal(hints3.platform, "xiaohongshu");
  assert.equal(hints3.platformExplicit, true);
});

test("P7.0 extractSearchHints: identifies Twitter / X queries without false positives on single 'x'", () => {
  const hints1 = extractSearchHints("在X上搜索 OpenAI 最新发布的模型");
  assert.equal(hints1.platform, "x");
  assert.equal(hints1.platformExplicit, true);

  const hints2 = extractSearchHints("Twitter关于 DeepSeek R1 的讨论");
  assert.equal(hints2.platform, "x");
  assert.equal(hints2.platformExplicit, true);

  const hints3 = extractSearchHints("推特上大家怎么看这个新特性");
  assert.equal(hints3.platform, "x");
  assert.equal(hints3.platformExplicit, true);

  // Negative tests: Solitary 'x' in mathematical or product terms MUST NOT trigger platform=x
  const negative1 = extractSearchHints("iPhone X 手机电池续航怎么样");
  assert.equal(negative1.platform, undefined);

  const negative2 = extractSearchHints("solve equation for x and y in python");
  assert.equal(negative2.platform, undefined);

  const negative3 = extractSearchHints("MacOS X architecture history");
  assert.equal(negative3.platform, undefined);
});

test("P7.0 web-fallback: buildFallbackQuery formats targeted queries", () => {
  assert.equal(
    buildFallbackQuery("xiaohongshu", "Gemini 3.7 测评"),
    "site:xiaohongshu.com Gemini 3.7 测评",
  );
  assert.equal(
    buildFallbackQuery("xiaohongshu", "site:xiaohongshu.com Gemini 3.7 测评"),
    "site:xiaohongshu.com Gemini 3.7 测评",
  );
  assert.equal(
    buildFallbackQuery("x", "DeepSeek R1"),
    "(site:x.com OR site:twitter.com) DeepSeek R1",
  );
});

test("P7.0 SpecializedSourceRegistry: routes to native source when connected & authenticated", async () => {
  const registry = new SpecializedSourceRegistry();

  const mockXhsSource: SpecializedSource = {
    id: "xiaohongshu",
    async probe(): Promise<SourceStatus> {
      return {
        id: "xiaohongshu",
        enabled: true,
        bridgeConnected: true,
        authenticated: true,
        account: { accountLabel: "测试小红书博主" },
      };
    },
    async search(req: SourceSearchRequest): Promise<SourceSearchOutcome> {
      return {
        id: "xiaohongshu",
        mode: "native-browser",
        sources: [{
          url: "https://www.xiaohongshu.com/explore/12345?xsec_token=ab12cd",
          title: "Gemini 3.7 实测",
          snippet: "非常好用",
        }],
        latencyMs: 150,
      };
    },
    async fetch(url: string): Promise<SourceFetchOutcome> {
      return {
        id: "xiaohongshu",
        mode: "native-browser",
        url,
        title: "Gemini 3.7 实测笔记",
        text: "正文内容...",
        latencyMs: 100,
      };
    },
  };

  registry.register(mockXhsSource);

  let generalSearchCalled = false;
  const mockGeneralSearch: WebSearchProviderLike = {
    id: "general",
    available: () => true,
    async search() {
      generalSearchCalled = true;
      return { sources: [], truncated: false };
    },
  };

  const outcome = await registry.routeSearch({ query: "小红书关于 Gemini 3.7 的评价" }, mockGeneralSearch);
  assert.equal(outcome.backend, "source:xiaohongshu");
  assert.equal(outcome.sources.length, 1);
  assert.equal(outcome.sources[0].title, "Gemini 3.7 实测");
  assert.equal(generalSearchCalled, false, "native source should satisfy query without calling general search");
});

test("P7.0 SpecializedSourceRegistry: falls back gracefully to general web when native source disconnected", async () => {
  const registry = new SpecializedSourceRegistry();

  const mockDisconnectedXhs: SpecializedSource = {
    id: "xiaohongshu",
    async probe(): Promise<SourceStatus> {
      return {
        id: "xiaohongshu",
        enabled: true,
        bridgeConnected: false,
        authenticated: false,
      };
    },
    async search(): Promise<SourceSearchOutcome> {
      throw new Error("Bridge not connected");
    },
    async fetch(): Promise<SourceFetchOutcome> {
      throw new Error("Bridge not connected");
    },
  };

  registry.register(mockDisconnectedXhs);

  let capturedQuery = "";
  const mockGeneralSearch: WebSearchProviderLike = {
    id: "general",
    available: () => true,
    async search(req) {
      capturedQuery = req.query;
      return {
        truncated: false,
        sources: [{
          url: "https://www.xiaohongshu.com/discovery/item/999",
          title: "Web Index XHS Result",
          snippet: "Fallback search snippet",
        }],
      };
    },
  };

  const outcome = await registry.routeSearch({ query: "小红书美食推荐" }, mockGeneralSearch);
  assert.equal(outcome.backend, "fallback:xiaohongshu");
  assert.equal(capturedQuery, "site:xiaohongshu.com 美食推荐");
  assert.equal(outcome.sources.length, 1);
  assert.ok(outcome.sources[0].snippet?.includes("[Web-index fallback; not native platform search]"));
});

test("P7.0 SpecializedSourceRegistry: routes non-platform query directly to general search", async () => {
  const registry = new SpecializedSourceRegistry();

  let generalSearchCalled = false;
  const mockGeneralSearch: WebSearchProviderLike = {
    id: "general",
    available: () => true,
    async search(req) {
      generalSearchCalled = true;
      return {
        truncated: false,
        sources: [{ url: "https://react.dev", title: "React Docs" }],
      };
    },
  };

  const outcome = await registry.routeSearch({ query: "React useEffect documentation" }, mockGeneralSearch);
  assert.equal(generalSearchCalled, true);
  assert.equal(outcome.sources[0].title, "React Docs");
});
