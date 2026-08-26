import assert from "node:assert/strict";
import test from "node:test";
import { extractSearchHints } from "../src/host/search-hints.ts";
import { SpecializedSourceRegistry } from "../src/host/sources/registry.ts";
import { XiaohongshuSource } from "../src/host/sources/xiaohongshu.ts";
import { XSource } from "../src/host/sources/x.ts";
import type { NativeBrowserRuntime, CdpPageLease } from "../src/host/browser/types.ts";

test("Integration: web_search on Xiaohongshu query routes via XHS source and degrades to general web discovery", async () => {
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
    verifyAuthenticationForOperation: async () => true,
    openPage: async () => {
      throw new Error("search must NOT open browser in production");
    },
    createPage: async () => {
      throw new Error("search must NOT open browser in production");
    },
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };

  const registry = new SpecializedSourceRegistry();
  const xhsSource = new XiaohongshuSource(fakeRuntime);
  registry.registerSource(xhsSource);

  // General web fallback provider records the query it received
  let fallbackQuery = "";
  const mockFallback: any = {
    search: async (req: any) => {
      fallbackQuery = req.query;
      return { sources: [{ title: "Fallback", url: "https://fallback.example/1", snippet: "s" }] };
    },
  };
  registry.setFallbackProviders(mockFallback, undefined);

  const query = "小红书上关于 Gemini 3.7 的讨论";
  const hints = extractSearchHints(query);
  assert.equal(hints.platform, "xiaohongshu");

  const outcome = await registry.search(hints.cleanQuery || query, { hints });
  assert.equal(outcome.retrievalMode, "degraded-web");
  assert.ok(fallbackQuery.includes("site:xiaohongshu.com"), "fallback should scope to xiaohongshu.com");
});
