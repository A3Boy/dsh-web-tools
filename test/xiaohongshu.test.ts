import assert from "node:assert/strict";
import test from "node:test";
import { XiaohongshuSource, setXhsNativeSearchEnabled } from "../src/host/sources/xiaohongshu.ts";
import type { NativeBrowserRuntime, CdpPageLease } from "../src/host/browser/types.ts";

test("XiaohongshuSource: executes search and fetch through NativeBrowserRuntime when authenticated", async () => {
  const structuredDetailNoteIds: unknown[] = [];
  const openedModes: unknown[] = [];
  const nativeSearchQueries: string[] = [];
  let lastOpenedUrl = "https://www.xiaohongshu.com/explore/note123?xsec_token=token123";
  const fakePage: CdpPageLease = {
    targetId: "target-xhs",
    sessionId: "session-xhs",
    navigate: async (url) => { lastOpenedUrl = url; },
    waitForLoad: async () => {},
    waitForSelector: async () => {},
    evaluate: async (expression: string) => {
      if (expression === "location.href") return lastOpenedUrl;
      if (expression.includes("section.note-item")) return 1;
      return {} as any;
    },
    call: async (fn: any, args?: unknown[]) => {
      if (fn.name === "detectXhsPageState") return "ready";
      if (fn.name === "extractXhsSearchState") {
        return { available: true, feeds: [{ id: "note123" }] };
      }
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
        structuredDetailNoteIds.push(args?.[0]);
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
      if (fn.name === "extractXhsCommentState") {
        return {
          data: {
            has_more: true,
            comments: [{
              id: "comment-1",
              content: "真实评论内容",
              likeCount: 7,
              userInfo: { userId: "user-1", nickname: "评论用户" },
              subCommentCount: 1,
              subComments: [{
                id: "reply-1",
                content: "真实逐条回复",
                userInfo: { userId: "user-2", nickname: "回复用户" },
              }],
            }],
          },
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
    focus: async () => true,
    insertText: async (text) => { nativeSearchQueries.push(text); },
    click: async () => {
      lastOpenedUrl = "https://www.xiaohongshu.com/search_result?keyword=Gemini%203.7";
      return true;
    },
    pressKey: async () => {},
    scrollBy: async () => {},
    beginJsonCapture: async () => ({
      wait: async () => ({
        state: "captured" as const,
        json: {
          data: {
            has_more: true,
            comments: [{
              id: "comment-1",
              content: "真实评论内容",
              like_count: 7,
              user_info: { user_id: "user-1", nickname: "评论用户" },
              sub_comment_count: 1,
              sub_comments: [{
                id: "reply-1",
                content: "真实逐条回复",
                user_info: { user_id: "user-2", nickname: "回复用户" },
              }],
            }],
          },
        },
        url: "https://edith.xiaohongshu.com/api/sns/web/v2/comment/page",
        status: 200,
      }),
      cancel: () => {},
    }),
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
    openPage: async (_platform, _url, _signal, mode) => {
      lastOpenedUrl = _url;
      openedModes.push(mode);
      return fakePage;
    },
    createPage: async (_platform, _signal, mode) => {
      openedModes.push(mode);
      return fakePage;
    },
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };

  const xhs = new XiaohongshuSource(fakeRuntime);
  const status = await xhs.status();
  assert.equal(status.authenticated, true);
  assert.equal(status.runtimeState, "ready");
  assert.equal(status.capabilities?.nativeSearch, true, "XHS native search must be enabled by default");
  assert.equal(status.capabilities?.nativeFetch, true, "XHS native fetch must be enabled");

  // Production default: native search runs through the signed-in browser.
  const searchRes = await xhs.search("Gemini 3.7", { maxResults: 5 });
  assert.equal(searchRes.items.length, 1);
  assert.deepEqual(nativeSearchQueries, ["Gemini 3.7"]);
  assert.equal(searchRes.items[0].id, "note123");
  assert.ok(searchRes.items[0].url.includes("xsec_token=token123"));

  // Operators can still explicitly disable the native path when debugging.
  setXhsNativeSearchEnabled(false);
  const fallbackRes = await xhs.search("Gemini 3.7", { maxResults: 5 });
  assert.equal(fallbackRes.error?.code, "runtime-unavailable");
  assert.equal(fallbackRes.items.length, 0);
  setXhsNativeSearchEnabled(true);

  const fetchRes = await xhs.fetch("https://www.xiaohongshu.com/explore/note123");
  assert.match(lastOpenedUrl, /xsec_token=token123/, "Fetch must restore the access token cached by native search");
  assert.equal(fetchRes.item?.title, "结构化标题 (Primary)", "Must use structured detail when available");
  assert.match(fetchRes.item?.text || "", /^结构化正文内容/);
  assert.match(fetchRes.item?.text || "", /真实评论内容/);
  assert.match(fetchRes.item?.text || "", /真实逐条回复/);
  assert.equal(fetchRes.item?.comments?.length, 2);
  assert.equal(fetchRes.item?.commentsTruncated, true);
  assert.equal(fetchRes.item?.likes, 666);
  assert.equal(fetchRes.item?.collects, 188);
  assert.equal(fetchRes.item?.replies, 25);
  assert.equal(openedModes.at(-1), "interactive", "XHS detail fetch must avoid headless risk-control");

  const discoveryFetchRes = await xhs.fetch(
    "https://www.xiaohongshu.com/discovery/item/6a0ec5410000000038037228?xsec_token=token123&xsec_source=pc_share",
  );
  assert.equal(discoveryFetchRes.item?.title, "结构化标题 (Primary)");
  assert.match(discoveryFetchRes.item?.text || "", /^结构化正文内容/);
  assert.equal(structuredDetailNoteIds.at(-1), "6a0ec5410000000038037228");
});

test("XiaohongshuSource: rejects an empty DOM detail instead of returning success", async () => {
  const fakePage = {
    navigate: async () => {},
    waitForLoad: async () => {},
    waitForSelector: async () => {},
    evaluate: async () => "https://www.xiaohongshu.com/discovery/item/6a0ec5410000000038037228?xsec_token=token123",
    call: async (fn: { name?: string }) => {
      if (fn.name === "extractXhsDetailState") return { available: false };
      return { isBlocked: false };
    },
    beginJsonCapture: async () => ({ wait: async () => ({ state: "timeout" as const }), cancel: () => {} }),
    close: async () => {},
  } as unknown as CdpPageLease;

  const fakeRuntime = {
    verifyAuthenticationForOperation: async () => true,
    createPage: async () => fakePage,
  } as unknown as NativeBrowserRuntime;

  const result = await new XiaohongshuSource(fakeRuntime).fetch(
    "https://www.xiaohongshu.com/discovery/item/6a0ec5410000000038037228?xsec_token=token123",
  );

  assert.equal(result.item, undefined);
  assert.equal(result.error?.code, "parse-failed");
  assert.match(result.error?.message ?? "", /extract note detail/i);
});

test("XiaohongshuSource: rejects a detail navigation redirected away from the target note", async () => {
  let structuredCalled = false;
  const fakePage = {
    navigate: async () => {},
    waitForLoad: async () => {},
    evaluate: async () => "https://www.xiaohongshu.com/explore",
    call: async () => {
      structuredCalled = true;
      return { available: true, title: "错误推荐笔记", text: "错误正文" };
    },
    beginJsonCapture: async () => ({ wait: async () => ({ state: "timeout" as const }), cancel: () => {} }),
    close: async () => {},
  } as unknown as CdpPageLease;
  const fakeRuntime = {
    verifyAuthenticationForOperation: async () => true,
    createPage: async () => fakePage,
  } as unknown as NativeBrowserRuntime;

  const result = await new XiaohongshuSource(fakeRuntime).fetch(
    "https://www.xiaohongshu.com/discovery/item/6a0ec5410000000038037228?xsec_token=token123",
  );

  assert.equal(structuredCalled, false);
  assert.equal(result.item, undefined);
  assert.equal(result.error?.code, "blocked");
  assert.match(result.error?.message ?? "", /redirected away/i);
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
  // Native search checks authentication before opening a page.
  const searchRes = await xhs.search("Gemini 3.7");
  assert.equal(openPageCalled, false);
  assert.equal(searchRes.error?.code, "auth-required");
  assert.equal(searchRes.items.length, 0);

  // Fetch still requires auth
  const fetchRes = await xhs.fetch("https://www.xiaohongshu.com/explore/note123");
  assert.equal(openPageCalled, false);
  assert.equal(fetchRes.error?.code, "auth-required");
});

test("XiaohongshuSource: maps explore and post-submit login walls to different failures", async () => {
  setXhsNativeSearchEnabled(true);
  try {
    for (const scenario of [
      { initial: "login-wall", after: "login-wall", expected: "auth-expired" },
      { initial: "ready", after: "login-wall", expected: "search-restricted" },
    ] as const) {
      let submitted = false;
      const page = {
        navigate: async () => {},
        waitForLoad: async () => {},
        waitForSelector: async () => {},
        call: async (fn: { name?: string }) => {
          if (fn.name === "detectXhsPageState") return submitted ? scenario.after : scenario.initial;
          return { available: false, feeds: [] };
        },
        evaluate: async (expression: string) => expression === "location.href"
          ? submitted
            ? "https://www.xiaohongshu.com/search_result?keyword=test"
            : "https://www.xiaohongshu.com/explore"
          : 0,
        focus: async () => true,
        insertText: async () => {},
        click: async () => { submitted = true; return true; },
        pressKey: async () => { submitted = true; },
        close: async () => {},
      } as unknown as CdpPageLease;
      const runtime = {
        verifyAuthenticationForOperation: async () => true,
        createPage: async () => page,
      } as unknown as NativeBrowserRuntime;

      const result = await new XiaohongshuSource(runtime).search("test");
      assert.equal(result.error?.code, scenario.expected);
    }
  } finally {
    setXhsNativeSearchEnabled(true);
  }
});
