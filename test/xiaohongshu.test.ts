/**
 * Unit & DOM extraction tests for P7.2: Xiaohongshu Source Adapter.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEngagementNumber, parseXhsSearchDom, parseXhsNoteDetailDom } from "../browser-bridge/src/sites/xiaohongshu.ts";
import { XiaohongshuSource } from "../src/host/sources/xiaohongshu.ts";
import { BridgeClient } from "../src/host/sources/bridge-client.ts";
import { BridgeHostServer } from "../src/host/sources/bridge-server.ts";

test("P7.2 parseEngagementNumber: accurately handles counts with 万/w/commas", () => {
  assert.equal(parseEngagementNumber("1.5万"), 15000);
  assert.equal(parseEngagementNumber("2.3w"), 23000);
  assert.equal(parseEngagementNumber("10万+"), 100000);
  assert.equal(parseEngagementNumber("1,234"), 1234);
  assert.equal(parseEngagementNumber("888"), 888);
  assert.equal(parseEngagementNumber(""), undefined);
  assert.equal(parseEngagementNumber(undefined), undefined);
});

test("P7.2 XiaohongshuSource: executes search and fetch through bridge", async () => {
  const server = new BridgeHostServer();
  const client = new BridgeClient(server);
  const source = new XiaohongshuSource(client);

  const mockWs = {
    send(raw: string) {
      const msg = JSON.parse(raw);
      if (msg.kind === "auth.status") {
        server.handleIncomingMessage(JSON.stringify({
          id: msg.id,
          kind: "result",
          payload: { authenticated: true, accountLabel: "测试博主" },
        }));
      } else if (msg.kind === "source.search") {
        server.handleIncomingMessage(JSON.stringify({
          id: msg.id,
          kind: "result",
          payload: {
            sources: [{
              url: "https://www.xiaohongshu.com/explore/64839201?xsec_token=CB12345678",
              title: "Gemini 3.7 全网首测",
              snippet: "作者: AI探长 | 👍 1.5万",
            }],
          },
        }));
      } else if (msg.kind === "source.fetch") {
        server.handleIncomingMessage(JSON.stringify({
          id: msg.id,
          kind: "result",
          payload: {
            title: "Gemini 3.7 全网首测",
            text: "今天全面测试了最新的 Gemini 3.7 Flash High 模型...",
            author: "AI探长",
            publishedAt: "2026-08-20",
          },
        }));
      }
    },
    close() {},
  };

  server.attachConnection(mockWs);

  // 1. Test probe
  const status = await source.probe();
  assert.equal(status.authenticated, true);
  assert.equal(status.account?.accountLabel, "测试博主");

  // 2. Test search preserving xsec_token
  const searchRes = await source.search({ query: "Gemini 3.7" });
  assert.equal(searchRes.mode, "native-browser");
  assert.equal(searchRes.sources.length, 1);
  assert.ok(searchRes.sources[0].url.includes("xsec_token=CB12345678"), "must preserve signed xsec_token");
  assert.equal(searchRes.sources[0].title, "Gemini 3.7 全网首测");

  // 3. Test fetch
  const fetchRes = await source.fetch("https://www.xiaohongshu.com/explore/64839201?xsec_token=CB12345678");
  assert.equal(fetchRes.mode, "native-browser");
  assert.equal(fetchRes.title, "Gemini 3.7 全网首测");
  assert.ok(fetchRes.text?.includes("Gemini 3.7 Flash High"));
  assert.equal(fetchRes.author, "AI探长");
});
