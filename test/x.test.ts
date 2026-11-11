import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { XSource, buildXSearchUrl, parseXMetricNumber, setSyndicationFetcher } from "../src/host/sources/x.ts";
// Keep every test hermetic: the public syndication endpoint is network I/O.
setSyndicationFetcher(async () => null);
import type { NativeBrowserRuntime, CdpPageLease, JsonCaptureHandle, NetworkCaptureOutcome } from "../src/host/browser/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Build a fake page whose capture returns a given outcome. */
function pageWithCapture(outcome: NetworkCaptureOutcome): { page: CdpPageLease; closes: { called: boolean } } {
  const closes = { called: false };
  const page: CdpPageLease = {
    targetId: "t",
    sessionId: "s",
    navigate: async () => {},
    waitForLoad: async () => {},
    waitForSelector: async () => {},
    evaluate: async () => "https://x.com/search?q=openai",
    call: async () => [],
    scrollBy: async () => {},
    beginJsonCapture: async () =>
      ({
        wait: async () => outcome,
        cancel: () => {},
      }) as JsonCaptureHandle,
    close: async () => {
      closes.called = true;
    },
  };
  return { page, closes };
}

function runtimeWithPage(page: CdpPageLease): { runtime: NativeBrowserRuntime; createPageCalls: { count: number } } {
  const createPageCalls = { count: 0 };
  const runtime: NativeBrowserRuntime = {
    detect: async () => ({ kind: "edge", executablePath: "msedge.exe" }),
    status: async () => ({
      platform: "x",
      runtimeAvailable: true,
      runtimeState: "ready",
      authState: "authenticated",
      authenticated: true,
    }),
    login: async () => ({} as any),
    checkAuthentication: async () => true,
    verifyAuthenticationForOperation: async () => true,
    openPage: async () => page,
    createPage: async () => {
      createPageCalls.count++;
      return page;
    },
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };
  return { runtime, createPageCalls };
}

test("XSource: parseXMetricNumber accurately parses metrics", () => {
  assert.equal(parseXMetricNumber("1.5K"), 1500);
  assert.equal(parseXMetricNumber("2M"), 2000000);
  assert.equal(parseXMetricNumber("3,500"), 3500);
});

test("XSource: buildXSearchUrl maps SearchHints correctly (since/until & news live tab, no inferred lang:)", () => {
  const url = buildXSearchUrl("OpenAI", {
    hints: {
      platform: "x",
      locale: { language: "en" },
      freshness: {
        preset: "week",
        after: "2026-08-16",
        before: "2026-08-23",
      },
      topic: "news",
    },
  });

  // Must NOT include inferred lang: filter (would break cross-language results)
  assert.ok(!url.includes("lang%3A"));
  assert.ok(url.includes("since%3A2026-08-16"));
  assert.ok(url.includes("until%3A2026-08-23"));
  assert.ok(url.includes("&f=live"));
});

test("XSource: executes search and tweet fetch through NativeBrowserRuntime when authenticated", async () => {
  const fakePage: CdpPageLease = {
    targetId: "target-x",
    sessionId: "session-x",
    navigate: async () => {},
    waitForLoad: async () => {},
    waitForSelector: async () => {},
    evaluate: async () => ({} as any),
    call: async (fn: any) => {
      if (fn.name === "extractVisibleXTweets") {
        return [
          {
            id: "1234567890",
            url: "https://x.com/openai/status/1234567890",
            text: "Excited to introduce our new model today!",
            authorName: "OpenAI",
            authorHandle: "@OpenAI",
            likes: 12000,
            retweets: 3500,
          },
        ];
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
      platform: "x",
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

  const xSource = new XSource(fakeRuntime);
  const status = await xSource.status();
  assert.equal(status.authenticated, true);
  assert.equal(status.runtimeState, "ready");

  const searchRes = await xSource.search("OpenAI", { maxResults: 5 });
  assert.equal(searchRes.items.length, 1);
  assert.equal(searchRes.items[0].id, "1234567890");
  assert.equal(searchRes.items[0].author?.handle, "@OpenAI");

  const fetchRes = await xSource.fetch("https://x.com/openai/status/1234567890");
  assert.equal(fetchRes.item?.text, "Excited to introduce our new model today!");
});

test("XSource: returns auth-required without opening page when unauthenticated", async () => {
  let openPageCalled = false;
  const fakeRuntime: NativeBrowserRuntime = {
    detect: async () => ({ kind: "edge", executablePath: "msedge.exe" }),
    status: async () => ({
      platform: "x",
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

  const xSource = new XSource(fakeRuntime);
  const searchRes = await xSource.search("OpenAI");
  assert.equal(openPageCalled, false);
  assert.equal(searchRes.error?.code, "auth-required");

  const fetchRes = await xSource.fetch("https://x.com/openai/status/123");
  assert.equal(openPageCalled, false);
  assert.equal(fetchRes.error?.code, "auth-required");
});

test("P7.2-A: search uses createPage + GraphQL PRIMARY, not openPage", async () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "x-searchtimeline.json"), "utf-8"),
  );

  const { page, closes } = pageWithCapture({
    state: "captured",
    json: fixture,
    url: "https://x.com/i/api/graphql/abc/SearchTimeline",
    status: 200,
  });
  const { runtime, createPageCalls } = runtimeWithPage(page);
  const xSource = new XSource(runtime);

  const res = await xSource.search("openai", { maxResults: 3 });
  assert.equal(createPageCalls.count, 1, "search must use createPage (not openPage)");
  assert.equal(res.error, undefined);
  assert.equal(res.retrievalMode, "native-browser");
  assert.equal(res.items.length, 3, "GraphQL PRIMARY must yield the fixture tweets");
  assert.equal(res.items[0].author?.handle, "@thsottiaux");
  assert.equal(res.items[1].author?.handle, "@LinearUncle");
  assert.equal(res.items[2].author?.name, "Mete Polat");
  assert.equal(closes.called, true, "page must be closed");
});

test("P7.2-A: thin GraphQL result supplements via DOM and merges by tweet id", async () => {
  // Single GraphQL tweet
  const thinFixture = {
    data: {
      search_by_raw_query: {
        search_timeline: {
          timeline: {
            instructions: [
              {
                type: "TimelineAddEntries",
                entries: [
                  {
                    entryId: "tweet-101",
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: "Tweet",
                            rest_id: "101",
                            legacy: { full_text: "GraphQL tweet text", favorite_count: 50 },
                            core: { user_results: { result: { core: { name: "GQL User", screen_name: "gql_user" } } } },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };

  const { page } = pageWithCapture({
    state: "captured",
    json: thinFixture,
    url: "https://x.com/i/api/graphql/abc/SearchTimeline",
    status: 200,
  });

  // DOM returns tweet-101 (duplicate, GraphQL should win) and tweet-102 (new)
  (page as any).call = async (fn: any) => {
    if (fn.name === "extractVisibleXTweets") {
      return [
        { id: "101", url: "https://x.com/dom/101", text: "DOM text (should be ignored)" },
        { id: "102", url: "https://x.com/dom/102", text: "DOM supplemental tweet 102" },
      ];
    }
    return [];
  };

  const { runtime } = runtimeWithPage(page);
  const res = await new XSource(runtime).search("openai", { maxResults: 5 });
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].id, "101");
  assert.equal(res.items[0].text, "GraphQL tweet text", "GraphQL fields take priority for id 101");
  assert.equal(res.items[1].id, "102");
  assert.equal(res.items[1].text, "DOM supplemental tweet 102");
});

test("P7.2-A: captured + recognized schema + 0 tweets is a valid native 0 (no parse-failed)", async () => {
  const emptyEnvelope = {
    data: {
      search_by_raw_query: {
        search_timeline: {
          timeline: { instructions: [{ type: "TimelineAddEntries", entries: [] }] },
        },
      },
    },
  };
  const { page } = pageWithCapture({
    state: "captured",
    json: emptyEnvelope,
    url: "https://x.com/i/api/graphql/abc/SearchTimeline",
    status: 200,
  });
  const { runtime } = runtimeWithPage(page);
  const res = await new XSource(runtime).search("nonexistent-topic-xyz", { maxResults: 5 });
  assert.equal(res.error, undefined, "schema-recognized empty must NOT be an error");
  assert.deepEqual(res.items, []);
  assert.equal(res.retrievalMode, "native-browser");
});

test("P7.2-A: captured 401/403 maps to auth-expired (never fake 0 results)", async () => {
  const { page } = pageWithCapture({
    state: "captured",
    json: { errors: [{ message: "Forbidden" }] },
    url: "https://x.com/i/api/graphql/abc/SearchTimeline",
    status: 403,
  });
  const { runtime } = runtimeWithPage(page);
  const res = await new XSource(runtime).search("openai");
  assert.equal(res.error?.code, "auth-expired");
  assert.equal(res.error?.retryable, false);
});

test("P7.2-A: timeout with login redirect detected and mapped to auth-expired", async () => {
  const { page } = pageWithCapture({ state: "timeout" });
  // Override evaluate to simulate a login redirect page during timeout
  (page as any).evaluate = async () => "https://x.com/i/flow/login";
  const { runtime } = runtimeWithPage(page);
  const res = await new XSource(runtime).search("openai");
  assert.equal(res.error?.code, "auth-expired");
});

test("P7.2-A: aborted search signal returns code: aborted", async () => {
  const ac = new AbortController();
  const { page } = pageWithCapture({ state: "aborted" });
  const { runtime } = runtimeWithPage(page);
  ac.abort();
  const res = await new XSource(runtime).search("openai", undefined, ac.signal);
  assert.equal(res.error?.code, "aborted");
});

test("P7.2-A: capture timeout falls back to DOM; empty DOM yields parse-failed", async () => {
  const { page } = pageWithCapture({ state: "timeout" });
  const { runtime } = runtimeWithPage(page);
  const res = await new XSource(runtime).search("openai", { maxResults: 5 });
  assert.equal(res.error?.code, "parse-failed", "no DOM tweets → parse-failed so registry can fall back");
});

test("P7.2-A: captured but schema unrecognized + empty DOM yields parse-failed (not fake 0)", async () => {
  const weirdJson = { totally: "different-envelope" };
  const { page } = pageWithCapture({
    state: "captured",
    json: weirdJson,
    url: "https://x.com/i/api/graphql/abc/SearchTimeline",
    status: 200,
  });
  const { runtime } = runtimeWithPage(page);
  const res = await new XSource(runtime).search("openai");
  assert.equal(res.error?.code, "parse-failed");
});

test("P7.2-B: fetch uses GraphQL PRIMARY matching exact targetTweetId from TweetDetail", async () => {
  const detailFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "x-tweetdetail.json"), "utf-8"),
  );
  const { page, closes } = pageWithCapture({
    state: "captured",
    json: detailFixture,
    url: "https://x.com/i/api/graphql/abc/TweetDetail",
    status: 200,
  });
  const { runtime, createPageCalls } = runtimeWithPage(page);
  const xSource = new XSource(runtime);

  const res = await xSource.fetch("https://x.com/thsottiaux/status/2091688655828246890");
  assert.equal(createPageCalls.count, 1, "fetch must use createPage + beginJsonCapture");
  assert.equal(res.error, undefined);
  assert.equal(res.retrievalMode, "native-browser");
  assert.equal(res.item?.id, "2091688655828246890");
  assert.equal(res.item?.author?.name, "Tibo");
  assert.equal(res.item?.author?.handle, "@thsottiaux");
  assert.ok(res.item?.text?.startsWith("Good Sunday"));
  assert.equal(res.item?.comments?.length, 2);
  assert.match(res.item?.text || "", /## Replies \(2 captured, truncated\)/);
  assert.match(res.item?.text || "", /It does include business accounts/);
  assert.equal(closes.called, true);
});

test("P7.2-B: fetch falls back to DOM and matches EXACT ID (rejects batch[0] mismatch)", async () => {
  const { page } = pageWithCapture({ state: "timeout" });
  // DOM returns 2 tweets: first is a parent tweet (mismatch), second is the target tweet
  (page as any).call = async (fn: any) => {
    if (fn.name === "extractVisibleXTweets") {
      return [
        { id: "parent_tweet_000", url: "https://x.com/parent/status/parent_tweet_000", text: "Parent tweet" },
        { id: "2091688655828246890", url: "https://x.com/thsottiaux/status/2091688655828246890", text: "Exact target tweet" },
      ];
    }
    return [];
  };

  const { runtime } = runtimeWithPage(page);
  const res = await new XSource(runtime).fetch("https://x.com/thsottiaux/status/2091688655828246890");
  assert.equal(res.error, undefined);
  assert.equal(res.item?.id, "2091688655828246890");
  assert.equal(res.item?.text, "Exact target tweet", "Must match exact ID rather than blindly taking batch[0]");
});

test("P7.2-B: fetch returns parse-failed if exact ID not found in DOM fallback", async () => {
  const { page } = pageWithCapture({ state: "timeout" });
  (page as any).call = async () => [
    { id: "unrelated_999", url: "https://x.com/other/status/unrelated_999", text: "Unrelated tweet" },
  ];
  const { runtime } = runtimeWithPage(page);
  const res = await new XSource(runtime).fetch("https://x.com/thsottiaux/status/2091688655828246890");
  assert.equal(res.error?.code, "parse-failed");
  assert.ok(res.error?.message.includes("2091688655828246890"));
});

test("P7.2-B: fetch maps 401/403 and login redirect to auth-expired", async () => {
  const { page } = pageWithCapture({
    state: "captured",
    json: { errors: [{ message: "Unauthorized" }] },
    url: "https://x.com/i/api/graphql/abc/TweetDetail",
    status: 401,
  });
  const { runtime } = runtimeWithPage(page);
  const res = await new XSource(runtime).fetch("https://x.com/thsottiaux/status/2091688655828246890");
  assert.equal(res.error?.code, "auth-expired");
});

test("P7.2-B: fetch returns aborted error when signal is aborted", async () => {
  const ac = new AbortController();
  const { page } = pageWithCapture({ state: "aborted" });
  const { runtime } = runtimeWithPage(page);
  ac.abort();
  const res = await new XSource(runtime).fetch("https://x.com/thsottiaux/status/2091688655828246890", ac.signal);
  assert.equal(res.error?.code, "aborted");
});

test("P7.2-B: fetch rejects invalid status URLs before opening browser", async () => {
  let createPageCalled = false;
  const runtime: NativeBrowserRuntime = {
    detect: async () => ({ kind: "edge", executablePath: "msedge.exe" }),
    status: async () => ({} as any),
    login: async () => ({} as any),
    checkAuthentication: async () => true,
    verifyAuthenticationForOperation: async () => true,
    openPage: async () => ({} as any),
    createPage: async () => {
      createPageCalled = true;
      return {} as any;
    },
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };
  const res = await new XSource(runtime).fetch("https://x.com/home");
  assert.equal(createPageCalled, false, "Must not create browser page for non-tweet URL");
  assert.equal(res.error?.code, "parse-failed");
});

test("XSource: buildXSearchUrl forceLatest switches to the chronological tab", () => {
  const top = buildXSearchUrl("GPTPLus", { hints: { platform: "x", cleanQuery: "GPTPLus" } });
  const latest = buildXSearchUrl("GPTPLus", { hints: { platform: "x", cleanQuery: "GPTPLus" } }, true);
  assert.ok(top.includes("src=typed_query"));
  assert.ok(!top.includes("f=live"));
  assert.ok(latest.includes("&f=live"));
});

test("XSource: retries the Latest tab when Top yields no tweets", async () => {
  const navigations: string[] = [];
  let attempt = 0;

  const makePage = (): CdpPageLease => {
    const index = ++attempt;
    return {
      targetId: `target-${index}`,
      sessionId: `session-${index}`,
      navigate: async (url: string) => {
        navigations.push(url);
      },
      waitForLoad: async () => {},
      waitForSelector: async () => {},
      evaluate: async () => "",
      call: async (fn: any) => {
        if (fn.name !== "extractVisibleXTweets") return null as any;
        // Top tab: nothing indexed yet. Latest tab: the fresh post.
        return index === 1
          ? []
          : [{ id: "999", url: "https://x.com/someone/status/999", text: "GPTPLus 还值得开吗", authorName: "Someone", authorHandle: "@someone" }];
      },
      scrollBy: async () => {},
      beginJsonCapture: async () => ({
        wait: async () => ({ state: "captured" as const, json: {}, url: "", status: 200 }),
        cancel: () => {},
      }),
      close: async () => {},
    };
  };

  const fakeRuntime: NativeBrowserRuntime = {
    detect: async () => ({ kind: "edge", executablePath: "msedge.exe" }),
    status: async () => ({
      platform: "x",
      runtimeAvailable: true,
      runtimeState: "ready",
      authState: "authenticated",
      authenticated: true,
    }),
    login: async () => ({} as any),
    checkAuthentication: async () => true,
    verifyAuthenticationForOperation: async () => true,
    openPage: async () => makePage(),
    createPage: async () => makePage(),
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };

  const source = new XSource(fakeRuntime);
  const res = await source.search("GPTPLus", { maxResults: 5 });

  assert.equal(res.error, undefined);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].id, "999");
  const searchNavigations = navigations.filter((u) => u.includes("/search?q="));
  assert.equal(searchNavigations.length, 2, "both tabs must be attempted");
  assert.ok(!searchNavigations[0].includes("f=live"), "first pass is the Top tab");
  assert.ok(searchNavigations[1].includes("f=live"), "second pass is the Latest tab");
});

test("XSource: search URL excludes reply noise and honors media intent", () => {
  const plain = buildXSearchUrl("GPTPLus", { hints: { platform: "x", cleanQuery: "GPTPLus", rawQuery: "GPTPLus" } });
  assert.ok(plain.includes("-filter%3Areplies"), "replies are excluded by default");

  const replies = buildXSearchUrl("OpenAI 回复", { hints: { platform: "x", cleanQuery: "OpenAI 回复", rawQuery: "OpenAI 回复" } });
  assert.ok(!replies.includes("-filter%3Areplies"), "an explicit reply request keeps replies");

  const video = buildXSearchUrl("DeepSeek video", { hints: { platform: "x", cleanQuery: "DeepSeek video", rawQuery: "DeepSeek video" } });
  assert.ok(video.includes("filter%3Avideos"));

  const trending = buildXSearchUrl("AI trending", { hints: { platform: "x", cleanQuery: "AI trending", rawQuery: "AI trending" } });
  assert.ok(trending.includes("min_faves%3A10"));

  // CJK queries must NOT get negative/operator suffixes: x.com mis-parses them.
  const cjk = buildXSearchUrl("DeepSeek 视频", { hints: { platform: "x", cleanQuery: "DeepSeek 视频", rawQuery: "DeepSeek 视频" } });
  assert.ok(!cjk.includes("filter%3Avideos"));
  assert.ok(!cjk.includes("-filter%3Areplies"));
});

test("XSource: the public syndication endpoint serves a tweet without any session", async () => {
  setSyndicationFetcher(async () => ({
    id_str: "123",
    text: "GPTPLus 又涨价了",
    created_at: "2026-11-09T10:00:00.000Z",
    favorite_count: 42,
    conversation_count: 7,
    user: { name: "测试用户", screen_name: "tester" },
  }));
  let pageCreated = false;
  const runtime = {
    detect: async () => ({ kind: "edge", executablePath: "msedge.exe" }),
    status: async () => ({ platform: "x", runtimeAvailable: true, runtimeState: "stopped", authState: "signed-out", authenticated: false }),
    login: async () => ({} as any),
    checkAuthentication: async () => false,
    verifyAuthenticationForOperation: async () => false,
    openPage: async () => { pageCreated = true; throw new Error("should not open a page"); },
    createPage: async () => { pageCreated = true; throw new Error("should not create a page"); },
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  } as any;

  const source = new XSource(runtime);
  const res = await source.fetch("https://x.com/tester/status/123");

  assert.equal(res.item?.text, "GPTPLus 又涨价了");
  assert.equal(res.item?.author?.handle, "@tester");
  assert.equal(res.item?.likes, 42);
  assert.equal(res.retrievalMode, "public-api");
  assert.equal(pageCreated, false, "no browser page may be opened for a public tweet");

  setSyndicationFetcher(async () => null);
});

test("XSource: authenticated fetch falls back to the public endpoint when the browser path fails", async () => {
  setSyndicationFetcher(async () => ({
    id_str: "555",
    text: "fallback text",
    user: { name: "用户", screen_name: "tester" },
  }));
  const runtime = {
    detect: async () => ({ kind: "edge", executablePath: "msedge.exe" }),
    status: async () => ({ platform: "x", runtimeAvailable: true, runtimeState: "ready", authState: "authenticated", authenticated: true }),
    login: async () => ({} as any),
    checkAuthentication: async () => true,
    verifyAuthenticationForOperation: async () => true,
    openPage: async () => { throw new Error("browser down"); },
    createPage: async () => { throw new Error("browser down"); },
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  } as any;

  const res = await new XSource(runtime).fetch("https://x.com/tester/status/555");
  assert.equal(res.retrievalMode, "public-api");
  assert.equal(res.item?.text, "fallback text");

  setSyndicationFetcher(async () => null);
});

test("XSource: automatically recovers from '出错了。请尝试重新加载。' error panel via retry capture", async () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "x-searchtimeline.json"), "utf-8"),
  );

  let captureIndex = 0;
  const page: CdpPageLease = {
    targetId: "t-error-panel",
    sessionId: "s-error-panel",
    navigate: async () => {},
    waitForLoad: async () => {},
    waitForSelector: async () => {},
    evaluate: async (script: string) => {
      if (typeof script === "string" && script.includes("SideNav_AccountSwitcher_Button")) {
        // readXPageSnapshot
        return {
          href: "https://x.com/search?q=test",
          title: "搜索 / X",
          text: "出错了。请尝试重新加载。",
          tweets: 0,
          graphql: 0,
          loggedIn: true,
          loginCta: false,
          errorPanel: true,
          readyState: "complete",
        };
      }
      if (typeof script === "string" && script.includes("重新加载")) {
        // clickXRetryIfPresent
        return true;
      }
      return "";
    },
    call: async () => [],
    scrollBy: async () => {},
    beginJsonCapture: async () => {
      const idx = ++captureIndex;
      return {
        wait: async () => {
          if (idx === 1) {
            // First pass fails / times out because of the error panel
            return { state: "timeout" as const };
          }
          // Second pass (the late retry capture) catches the reload!
          return {
            state: "captured" as const,
            status: 200,
            json: fixture,
            url: "https://x.com/i/api/graphql/abc/SearchTimeline",
          };
        },
        cancel: () => {},
      };
    },
    close: async () => {},
  };

  const { runtime } = runtimeWithPage(page);
  const xSource = new XSource(runtime);
  const res = await xSource.search("test query");

  assert.equal(res.error, undefined);
  assert.equal(res.retrievalMode, "native-browser");
  assert.equal(res.items.length, 3);
  assert.equal(captureIndex, 2, "must have triggered the late retry capture");
});

test("XSource: un-stalls hanging splash screen via reload and late capture", async () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "x-searchtimeline.json"), "utf-8"),
  );

  let captureIndex = 0;
  let reloadsCount = 0;
  const page: CdpPageLease = {
    targetId: "t-splash",
    sessionId: "s-splash",
    navigate: async () => {},
    waitForLoad: async () => {},
    waitForSelector: async () => {},
    evaluate: async (script: string) => {
      if (typeof script === "string" && script.includes("location.reload")) {
        reloadsCount++;
        return "";
      }
      if (typeof script === "string" && script.includes("SideNav_AccountSwitcher_Button")) {
        // First snapshot checks show unhydrated splash screen
        if (reloadsCount === 0) {
          return {
            href: "https://x.com/search?q=test",
            title: "X",
            text: "",
            tweets: 0,
            graphql: 0,
            loggedIn: false,
            loginCta: false,
            errorPanel: false,
            readyState: "complete",
          };
        }
        return {
          href: "https://x.com/search?q=test",
          title: "搜索 / X",
          text: "搜索结果",
          tweets: 3,
          graphql: 1,
          loggedIn: true,
          loginCta: false,
          errorPanel: false,
          readyState: "complete",
        };
      }
      return "";
    },
    call: async () => [],
    scrollBy: async () => {},
    beginJsonCapture: async () => {
      const idx = ++captureIndex;
      return {
        wait: async () => {
          if (idx === 1) {
            // Initial capture times out because splash screen stalled
            return { state: "timeout" as const };
          }
          // The late capture from reload catches SearchTimeline
          return {
            state: "captured" as const,
            status: 200,
            json: fixture,
            url: "https://x.com/i/api/graphql/abc/SearchTimeline",
          };
        },
        cancel: () => {},
      };
    },
    close: async () => {},
  };

  const { runtime } = runtimeWithPage(page);
  const xSource = new XSource(runtime);
  const res = await xSource.search("test splash query");

  assert.equal(res.error, undefined);
  assert.equal(res.retrievalMode, "native-browser");
  assert.equal(res.items.length, 3);
  assert.equal(reloadsCount, 1, "must have triggered window.location.reload() to un-stall");
  assert.equal(captureIndex, 2, "must have captured SearchTimeline after reload");
});
