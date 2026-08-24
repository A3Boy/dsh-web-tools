import assert from "node:assert/strict";
import test from "node:test";
import { XiaohongshuSource, setXhsNativeSearchEnabled } from "../src/host/sources/xiaohongshu.ts";
import type { NativeBrowserRuntime, CdpPageLease } from "../src/host/browser/types.ts";

test("XiaohongshuSource: executes search and fetch through NativeBrowserRuntime when authenticated", async () => {
  const fakePage: CdpPageLease = {
    targetId: "target-xhs",
    sessionId: "session-xhs",
    navigate: async () => {},
    waitForLoad: async () => {},
    waitForSelector: async () => {},
    evaluate: async () => ({} as any),
    call: async (fn: any) => {
      if (fn.name === "extractVisibleXhsSearch") {
        return [
          {
            id: "note123",
            title: "小红书笔记标题",
            url: "https://www.xiaohongshu.com/explore/note123?xsec_token=token123",
            snippet: "笔记摘要",
            authorName: "测试博主",
            likes: 520,
          },
        ];
      }
      if (fn.name === "extractXhsDetailState") {
        return {
          available: true,
          title: "结构化标题 (Primary)",
          text: "结构化正文内容",
          authorName: "测试博主",
          likes: 666,
          collects: 188,
          comments: 25,
        };
      }
      if (fn.name === "extractXhsNoteDetail") {
        return {
          title: "小红书DOM笔记标题",
          text: "这是小红书DOM笔记正文内容",
          authorName: "测试博主",
          likes: 520,
          isBlocked: false,
        };
      }
      return null as any;
    },
    scrollBy: async () => {},
    beginJsonCapture: async () => ({ wait: async () => ({ state: "captured" as const, json: {}, url: "", status: 200 }), cancel: () => {} }),
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
    verifyAuthenticationForOperation: async () => true,
    openPage: async () => fakePage,
    createPage: async () => fakePage,
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };

  const xhs = new XiaohongshuSource(fakeRuntime);
  const status = await xhs.status();
  assert.equal(status.authenticated, true);
  assert.equal(status.runtimeState, "ready");
  assert.equal(status.capabilities?.nativeSearch, false, "XHS native search must be disabled in production");
  assert.equal(status.capabilities?.nativeFetch, true, "XHS native fetch must be enabled");

  // Production default: search signals degraded-web fallback (no browser)
  setXhsNativeSearchEnabled(false);
  const fallbackRes = await xhs.search("Gemini 3.7", { maxResults: 5 });
  assert.equal(fallbackRes.error?.code, "runtime-unavailable");
  assert.equal(fallbackRes.items.length, 0);

  // Experimental: when explicitly enabled, native search runs through browser
  setXhsNativeSearchEnabled(true);
  const searchRes = await xhs.search("Gemini 3.7", { maxResults: 5 });
  assert.equal(searchRes.items.length, 1);
  assert.equal(searchRes.items[0].id, "note123");
  assert.ok(searchRes.items[0].url.includes("xsec_token=token123"));
  setXhsNativeSearchEnabled(false);

  const fetchRes = await xhs.fetch("https://www.xiaohongshu.com/explore/note123?xsec_token=token123");
  assert.equal(fetchRes.item?.title, "结构化标题 (Primary)", "Must use structured detail when available");
  assert.equal(fetchRes.item?.text, "结构化正文内容");
  assert.equal(fetchRes.item?.likes, 666);
  assert.equal(fetchRes.item?.collects, 188);
  assert.equal(fetchRes.item?.replies, 25);
});

test("XiaohongshuSource: returns auth-required without opening page when unauthenticated", async () => {
  let openPageCalled = false;
  const fakeRuntime: NativeBrowserRuntime = {
    detect: async () => ({ kind: "edge", executablePath: "msedge.exe" }),
    status: async () => ({
      platform: "xiaohongshu",
      runtimeAvailable: true,
      runtimeState: "stopped",
      authState: "signed-out",
      authenticated: false,
    }),
    login: async () => ({} as any),
    checkAuthentication: async () => false,
    verifyAuthenticationForOperation: async () => false,
    openPage: async () => {
      openPageCalled = true;
      throw new Error("Should not open page");
    },
    createPage: async () => {
      openPageCalled = true;
      throw new Error("Should not create page");
    },
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };

  const xhs = new XiaohongshuSource(fakeRuntime);
  // Production default: search always returns degraded-web fallback regardless of auth
  const searchRes = await xhs.search("Gemini 3.7");
  assert.equal(openPageCalled, false);
  assert.equal(searchRes.error?.code, "runtime-unavailable");
  assert.equal(searchRes.items.length, 0);

  // Fetch still requires auth
  const fetchRes = await xhs.fetch("https://www.xiaohongshu.com/explore/note123");
  assert.equal(openPageCalled, false);
  assert.equal(fetchRes.error?.code, "auth-required");
});
