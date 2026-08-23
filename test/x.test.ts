/**
 * Unit & DOM extraction tests for P7.3: Twitter / X Source Adapter.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXMetricNumber, buildXSearchUrl, parseXTweetDom } from "../browser-bridge/src/sites/x.ts";
import { XSource } from "../src/host/sources/x.ts";
import { BridgeClient } from "../src/host/sources/bridge-client.ts";
import { BridgeHostServer } from "../src/host/sources/bridge-server.ts";

test("P7.3 parseXMetricNumber: accurately parses K, M, and commas", () => {
  assert.equal(parseXMetricNumber("1.2K"), 1200);
  assert.equal(parseXMetricNumber("3.5M"), 3500000);
  assert.equal(parseXMetricNumber("12,345"), 12345);
  assert.equal(parseXMetricNumber("99"), 99);
  assert.equal(parseXMetricNumber(""), undefined);
});

test("P7.3 buildXSearchUrl: builds search URL with native operators and tabs", () => {
  // 1. Basic top search
  const url1 = buildXSearchUrl("OpenAI Sora");
  assert.equal(url1, "https://x.com/search?q=OpenAI%20Sora&src=typed_query");

  // 2. Tab latest (live) with fromUser and lang
  const url2 = buildXSearchUrl("GPT-5", {
    tab: "live",
    fromUser: "sama",
    language: "en",
    sinceDate: "2026-08-01",
  });
  assert.ok(url2.includes("f=live"));
  assert.ok(url2.includes("from%3Asama"));
  assert.ok(url2.includes("lang%3Aen"));
  assert.ok(url2.includes("since%3A2026-08-01"));
});

test("P7.3 XSource: executes search and tweet fetch through bridge", async () => {
  const server = new BridgeHostServer();
  const client = new BridgeClient(server);
  const source = new XSource(client);

  const mockWs = {
    send(raw: string) {
      const msg = JSON.parse(raw);
      if (msg.kind === "auth.status") {
        server.handleIncomingMessage(JSON.stringify({
          id: msg.id,
          kind: "result",
          payload: { authenticated: true, accountLabel: "Sam Altman (@sama)" },
        }));
      } else if (msg.kind === "source.search") {
        server.handleIncomingMessage(JSON.stringify({
          id: msg.id,
          kind: "result",
          payload: {
            sources: [{
              url: "https://x.com/sama/status/189283746192837",
              title: "Sam Altman (@sama): very excited about the progress on reasoning models...",
              snippet: "very excited about the progress on reasoning models...",
            }],
          },
        }));
      } else if (msg.kind === "source.fetch") {
        server.handleIncomingMessage(JSON.stringify({
          id: msg.id,
          kind: "result",
          payload: {
            url: msg.payload.url,
            title: "Sam Altman on X",
            text: "very excited about the progress on reasoning models today.",
            author: "Sam Altman (@sama)",
            publishedAt: "2026-08-22T15:00:00.000Z",
          },
        }));
      }
    },
    close() {},
  };

  server.attachConnection(mockWs);

  // 1. Probe
  const status = await source.probe();
  assert.equal(status.authenticated, true);
  assert.equal(status.account?.accountLabel, "Sam Altman (@sama)");

  // 2. Search
  const searchRes = await source.search({ query: "from:sama reasoning models" });
  assert.equal(searchRes.mode, "native-browser");
  assert.equal(searchRes.sources.length, 1);
  assert.ok(searchRes.sources[0].url.includes("/status/"));
  assert.ok(searchRes.sources[0].title.includes("Sam Altman"));

  // 3. Fetch
  const fetchRes = await source.fetch("https://x.com/sama/status/189283746192837");
  assert.equal(fetchRes.mode, "native-browser");
  assert.ok(fetchRes.text?.includes("very excited about the progress"));
  assert.equal(fetchRes.author, "Sam Altman (@sama)");
});
