import assert from "node:assert/strict";
import test from "node:test";
import { XiaohongshuSource } from "../src/host/sources/xiaohongshu.ts";
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
      if (fn.name === "extractXhsNoteDetail") {
        return {
          title: "小红书笔记标题详情",
          text: "这是小红书笔记正文内容",
          authorName: "测试博主",
          likes: 520,
          isBlocked: false,
        };
      }
      return null as any;
    },
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
    verifyAuthenticationForOperation: async () => true,
    openPage: async () => fakePage,
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };

  const xhs = new XiaohongshuSource(fakeRuntime);
  const status = await xhs.status();
  assert.equal(status.authenticated, true);
  assert.equal(status.runtimeState, "ready");

  const searchRes = await xhs.search("Gemini 3.7", { maxResults: 5 });
  assert.equal(searchRes.items.length, 1);
  assert.equal(searchRes.items[0].id, "note123");
  assert.ok(searchRes.items[0].url.includes("xsec_token=token123"));

  const fetchRes = await xhs.fetch("https://www.xiaohongshu.com/explore/note123?xsec_token=token123");
  assert.equal(fetchRes.item?.title, "小红书笔记标题详情");
  assert.equal(fetchRes.item?.text, "这是小红书笔记正文内容");
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
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };

  const xhs = new XiaohongshuSource(fakeRuntime);
  const searchRes = await xhs.search("Gemini 3.7");
  assert.equal(openPageCalled, false);
  assert.equal(searchRes.error?.code, "auth-required");

  const fetchRes = await xhs.fetch("https://www.xiaohongshu.com/explore/note123");
  assert.equal(openPageCalled, false);
  assert.equal(fetchRes.error?.code, "auth-required");
});
