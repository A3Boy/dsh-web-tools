import assert from "node:assert/strict";
import test from "node:test";
import { XSource, buildXSearchUrl, parseXMetricNumber } from "../src/host/sources/x.ts";
import type { NativeBrowserRuntime, CdpPageLease } from "../src/host/browser/types.ts";

test("XSource: parseXMetricNumber accurately parses metrics", () => {
  assert.equal(parseXMetricNumber("1.5K"), 1500);
  assert.equal(parseXMetricNumber("2M"), 2000000);
  assert.equal(parseXMetricNumber("3,500"), 3500);
});

test("XSource: buildXSearchUrl maps SearchHints correctly", () => {
  const url = buildXSearchUrl("OpenAI", {
    hints: {
      platform: "x",
      author: "@sama",
      locale: { language: "en" },
      sortBy: "latest",
    },
  });

  assert.ok(url.includes("from%3Asama"));
  assert.ok(url.includes("lang%3Aen"));
  assert.ok(url.includes("&f=live"));
});

test("XSource: executes search and tweet fetch through NativeBrowserRuntime", async () => {
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
    openPage: async () => fakePage,
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
