import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { XSource, buildXSearchUrl, parseXMetricNumber } from "../src/host/sources/x.ts";
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
