import test from "node:test";
import assert from "node:assert/strict";
import { KeenableProvider, parseKeenableSearchJson } from "../src/host/providers/keenable.ts";

test("KeenableProvider search posts query + max_results with x-api-key", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: any = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    capturedBody = JSON.parse(init?.body as string);
    return {
      status: 200,
      ok: true,
      json: async () => ({
        results: [
          { url: "https://example.com/a", title: "A", description: "Desc A", snippet: "s" },
          { url: "https://example.com/b", title: "B", description: "", snippet: "x".repeat(900) },
          { title: "no url" },
        ],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const outcome = await KeenableProvider.search("test query", 50, "kn-key", undefined);
    assert.equal(capturedUrl, "https://api.keenable.ai/v1/search");
    assert.equal(capturedHeaders["x-api-key"], "kn-key");
    assert.equal(capturedHeaders["x-keenable-title"], "dsh-web-tools");
    assert.deepEqual(capturedBody, { query: "test query", max_results: 20 });
    assert.equal(outcome.sources.length, 2);
    assert.equal(outcome.sources[0].snippet, "Desc A");
    assert.equal(outcome.sources[1].snippet, "x".repeat(600) + "…");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("KeenableProvider requires an API key and is search-only", async () => {
  await assert.rejects(() => KeenableProvider.search("q", 5, "", undefined), /API key is not configured/);
  await assert.rejects(() => KeenableProvider.fetch("https://example.com", "k", undefined), /native fetch/);
  assert.equal(KeenableProvider.fetchCapable, false);
});

test("parseKeenableSearchJson tolerates malformed bodies", () => {
  assert.deepEqual(parseKeenableSearchJson(null, 5), []);
  assert.deepEqual(parseKeenableSearchJson({ results: "nope" }, 5), []);
});
