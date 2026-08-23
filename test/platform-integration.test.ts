/**
 * Integration test: verify that web_search transparently routes platform queries to SpecializedSourceRegistry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSourceRegistry } from "../src/host/sources/registry.ts";
import type { SpecializedSource, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome } from "../src/host/sources/types.ts";
import type { WebSearchProviderLike } from "../src/host/registry.ts";

test("Integration: web_search on Xiaohongshu query routes to XiaohongshuSource before general provider", async () => {
  let generalCalled = false;
  const mockGeneralProvider: WebSearchProviderLike = {
    id: "general-mock",
    available: () => true,
    async search() {
      generalCalled = true;
      return { sources: [], truncated: false };
    },
  };

  let xhsSourceCalled = false;
  const mockXhs: SpecializedSource = {
    id: "xiaohongshu",
    async probe(): Promise<SourceStatus> {
      return {
        id: "xiaohongshu",
        enabled: true,
        bridgeConnected: true,
        authenticated: true,
        account: { accountLabel: "集成测试博主" },
      };
    },
    async search(req: SourceSearchRequest): Promise<SourceSearchOutcome> {
      xhsSourceCalled = true;
      return {
        id: "xiaohongshu",
        mode: "native-browser",
        sources: [{
          url: "https://www.xiaohongshu.com/explore/11223344?xsec_token=TOKEN999",
          title: "小红书最新测试笔记",
          snippet: "正文测试...",
        }],
        latencyMs: 80,
      };
    },
    async fetch(url: string): Promise<SourceFetchOutcome> {
      return {
        id: "xiaohongshu",
        mode: "native-browser",
        url,
        title: "小红书最新测试笔记",
        text: "正文内容...",
        latencyMs: 50,
      };
    },
  };

  // Register the mock source
  defaultSourceRegistry.register(mockXhs);

  // Execute search via defaultSourceRegistry routing
  const result = await defaultSourceRegistry.routeSearch(
    { query: "小红书上大家对新模型的反馈", maxResults: 5 },
    mockGeneralProvider,
  );

  assert.equal(xhsSourceCalled, true, "XiaohongshuSource must be called for '小红书' query");
  assert.equal(generalCalled, false, "General provider must not be invoked when platform source succeeds");
  assert.equal(result.sources.length, 1);
  assert.ok(result.sources[0].url.includes("xsec_token=TOKEN999"));
  assert.equal(result.backend, "source:xiaohongshu");
});
