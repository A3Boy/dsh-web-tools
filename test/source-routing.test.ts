import assert from "node:assert/strict";
import test from "node:test";
import { extractSearchHints } from "../src/host/search-hints.ts";
import { buildFallbackQuery } from "../src/host/sources/web-fallback.ts";
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

  const hints2 = extractSearchHints("Twitter latest updates");
  assert.equal(hints2.platform, "x");
  assert.equal(hints2.platformExplicit, true);

  // False positive checks
  const hints3 = extractSearchHints("macos x download");
  assert.equal(hints3.platform, undefined);

  const hints4 = extractSearchHints("iphone x price");
  assert.equal(hints4.platform, undefined);

  const hints5 = extractSearchHints("X-ray imaging principles");
  assert.equal(hints5.platform, undefined);
});

test("P7.0 web-fallback: buildFallbackQuery formats targeted queries", () => {
  assert.equal(
    buildFallbackQuery("小红书 北京烤鸭推荐", "xiaohongshu"),
    "site:xiaohongshu.com 北京烤鸭推荐",
  );
  assert.ok(
    buildFallbackQuery("X上的深度学习讨论", "x").includes("深度学习讨论"),
  );
});

test("P7.0 SpecializedSourceRegistry: routes to native source and keeps 0 results without falling back", async () => {
  const registry = new SpecializedSourceRegistry();
  let nativeSearchCalled = false;

  const fakeSource: SpecializedSource = {
    id: "xiaohongshu",
    name: "小红书",
    status: async () => ({
      id: "xiaohongshu",
      name: "小红书",
      enabled: true,
      runtimeAvailable: true,
      runtimeState: "ready",
      authenticated: true,
    }),
    search: async () => {
      nativeSearchCalled = true;
      return { items: [] }; // 0 results is a valid search, not an error!
    },
    fetch: async () => ({ item: undefined }),
  };

  let fallbackCalled = false;
  const mockFallbackSearch: any = {
    search: async () => {
      fallbackCalled = true;
      return { sources: [{ title: "Fallback Note", url: "https://fallback.com/note", snippet: "Fallback" }] };
    },
  };

  registry.registerSource(fakeSource);
  registry.setFallbackProviders(mockFallbackSearch, undefined);

  const outcome = await registry.search("极小众词汇搜索", {
    hints: { platform: "xiaohongshu", cleanQuery: "极小众词汇搜索" },
  });

  assert.equal(nativeSearchCalled, true);
  assert.equal(fallbackCalled, false); // 0 result must NOT fallback!
  assert.equal(outcome.retrievalMode, "native-browser");
  assert.equal(outcome.items.length, 0);
});

test("P7.0 SpecializedSourceRegistry: falls back gracefully to general web when native source fails", async () => {
  const registry = new SpecializedSourceRegistry();

  const brokenSource: SpecializedSource = {
    id: "xiaohongshu",
    name: "小红书",
    status: async () => ({
      id: "xiaohongshu",
      name: "小红书",
      enabled: true,
      runtimeAvailable: false,
      runtimeState: "unavailable",
      authenticated: false,
    }),
    search: async () => ({
      items: [],
      error: { code: "runtime-unavailable", message: "Browser unavailable", retryable: true },
    }),
    fetch: async () => ({
      error: { code: "runtime-unavailable", message: "Browser unavailable", retryable: true },
    }),
  };

  let fallbackQuery = "";
  const mockFallbackSearch: any = {
    search: async (req: any) => {
      fallbackQuery = req.query;
      return { sources: [{ title: "Fallback Note", url: "https://fallback.com/note", snippet: "Fallback" }] };
    },
  };

  registry.registerSource(brokenSource);
  registry.setFallbackProviders(mockFallbackSearch, undefined);

  const outcome = await registry.search("小红书 探店", {
    hints: { platform: "xiaohongshu", cleanQuery: "探店" },
  });

  assert.equal(fallbackQuery, "site:xiaohongshu.com 探店");
  assert.equal(outcome.retrievalMode, "degraded-web");
  assert.equal(outcome.items.length, 1);
});

test("P7.0 SpecializedSourceRegistry: routes non-platform query directly to general search", async () => {
  const registry = new SpecializedSourceRegistry();

  let generalSearchCalled = false;
  const mockGeneralSearch: any = {
    search: async () => {
      generalSearchCalled = true;
      return { sources: [{ title: "DeepSeek", url: "https://deepseek.com", snippet: "AI" }] };
    },
  };

  registry.setFallbackProviders(mockGeneralSearch, undefined);

  const outcome = await registry.search("DeepSeek-R1 paper");
  assert.equal(generalSearchCalled, true);
  assert.equal(outcome.retrievalMode, "general-web");
  assert.equal(outcome.items[0].title, "DeepSeek");
});
