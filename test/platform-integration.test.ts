import assert from "node:assert/strict";
import test from "node:test";
import { extractSearchHints } from "../src/host/search-hints.ts";
import { SpecializedSourceRegistry } from "../src/host/sources/registry.ts";
import { XiaohongshuSource } from "../src/host/sources/xiaohongshu.ts";
import { XSource } from "../src/host/sources/x.ts";
import type { NativeBrowserRuntime, CdpPageLease } from "../src/host/browser/types.ts";

test("Integration: web_search on Xiaohongshu query routes to XiaohongshuSource via NativeBrowserRuntime", async () => {
  const fakePage: CdpPageLease = {
    targetId: "t1",
    sessionId: "s1",
    navigate: async () => {},
    waitForLoad: async () => {},
    waitForSelector: async () => {},
    evaluate: async () => ({} as any),
    call: async () => [
      {
        id: "xhs1",
        title: "小红书真实测评",
        url: "https://www.xiaohongshu.com/explore/xhs1?xsec_token=xyz",
        snippet: "测评内容",
        authorName: "测评达人",
        likes: 888,
      },
    ],
    scrollBy: async () => {},
    close: async () => {},
  };

  const fakeRuntime: NativeBrowserRuntime = {
    detect: async () => ({ kind: "edge", executablePath: "msedge.exe" }),
    status: async () => ({
      platform: "xiaohongshu",
      runtimeAvailable: true,
      runtimeState: "ready",
      authState: "authenticated",
      authenticated: true,
    }),
    login: async () => ({} as any),
    checkAuthentication: async () => true,
    openPage: async () => fakePage,
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };

  const registry = new SpecializedSourceRegistry();
  const xhsSource = new XiaohongshuSource(fakeRuntime);
  registry.registerSource(xhsSource);

  const query = "小红书上关于 Gemini 3.7 的讨论";
  const hints = extractSearchHints(query);
  assert.equal(hints.platform, "xiaohongshu");

  const outcome = await registry.search(hints.cleanQuery || query, { hints });
  assert.equal(outcome.retrievalMode, "native-browser");
  assert.equal(outcome.items.length, 1);
  assert.equal(outcome.items[0].id, "xhs1");
  assert.ok(outcome.items[0].url.includes("xsec_token=xyz"));
});
