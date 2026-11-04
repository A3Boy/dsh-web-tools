import test from "node:test";
import assert from "node:assert/strict";
import { KeenableProvider, buildKeenableSearchBody, parseKeenableSearchJson } from "../src/host/providers/keenable.ts";

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
          { url: "https://example.com/a", title: "A", description: "Desc A", snippet: "s", published_at: "2026-10-01T00:00:00Z" },
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
    assert.equal(outcome.sources[0].publishedAt, "2026-10-01T00:00:00Z");
    assert.equal(outcome.sources[1].publishedAt, undefined);
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

test("parseKeenableSearchJson caps long descriptions too", () => {
  const out = parseKeenableSearchJson({ results: [{ url: "https://e.com", description: "d".repeat(900) }] }, 5);
  assert.equal(out[0].snippet, "d".repeat(600) + "…");
});

test("buildKeenableSearchBody forwards site and freshness hints", () => {
  const hints = {
    cleanQuery: "release notes",
    rawQuery: "site:foo.com release notes",
    domains: { include: ["foo.com", "bar.com"] },
    freshness: { after: "2026-10-01", before: "2026-10-31" },
  } as any;
  assert.deepEqual(buildKeenableSearchBody("release notes", 5, hints), {
    query: "release notes",
    max_results: 5,
    site: "foo.com",
    published_after: "2026-10-01",
    published_before: "2026-10-31",
  });
  assert.deepEqual(buildKeenableSearchBody("q", 3), { query: "q", max_results: 3 });
});
