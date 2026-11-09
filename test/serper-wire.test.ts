import test from "node:test";
import assert from "node:assert/strict";
import {
  SerperProvider,
  buildSerperSearchBody,
  mapSerperFreshness,
  parseSerperSearchJson,
} from "../src/host/providers/serper.ts";

test("SerperProvider search posts query with X-API-KEY and returns parsed sources", async () => {
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
      headers: { get: () => null },
      json: async () => ({
        answerBox: {
          title: "Serper Overview",
          answer: "Serper provides Google search data.",
          link: "https://serper.dev",
        },
        organic: [
          {
            title: "Result 1",
            link: "https://example.com/1",
            snippet: "Snippet 1",
            date: "Nov 5, 2026",
          },
          {
            title: "Result 2",
            link: "https://example.com/2",
            snippet: "Snippet 2",
          },
          {
            title: "Missing link",
          },
        ],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const outcome = await SerperProvider.search(
      "google search api",
      10,
      "serper-secret-key",
      undefined,
      {
        hints: {
          cleanQuery: "google search api",
          rawQuery: "google search api site:example.com",
          domains: { include: ["example.com"], exclude: ["spam.com"] },
          locale: { country: "US", language: "en" },
          freshness: { preset: "week" },
        },
      },
    );

    assert.equal(capturedUrl, "https://google.serper.dev/search");
    assert.equal(capturedHeaders["X-API-KEY"], "serper-secret-key");
    assert.equal(capturedBody.q, "google search api site:example.com -site:spam.com");
    assert.equal(capturedBody.num, 10);
    assert.equal(capturedBody.gl, "us");
    assert.equal(capturedBody.hl, "en");
    assert.equal(capturedBody.tbs, "qdr:w");

    assert.equal(outcome.sources.length, 3); // 1 answerBox + 2 organic with links
    assert.equal(outcome.sources[0].url, "https://serper.dev");
    assert.equal(outcome.sources[0].snippet, "Serper provides Google search data.");
    assert.equal(outcome.sources[1].url, "https://example.com/1");
    assert.equal(outcome.sources[1].title, "Result 1");
    assert.equal(outcome.sources[1].publishedAt, "Nov 5, 2026");
    assert.equal(outcome.sources[2].url, "https://example.com/2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SerperProvider requires API key and does not support native fetch", async () => {
  await assert.rejects(() => SerperProvider.search("q", 5, "", undefined), /API key is not configured/);
  await assert.rejects(() => SerperProvider.fetch("https://example.com", "k", undefined), /native fetch/);
  assert.equal(SerperProvider.fetchCapable, false);
});

test("mapSerperFreshness maps presets to Google tbs", () => {
  assert.equal(mapSerperFreshness({ freshness: { preset: "day" } } as any), "qdr:d");
  assert.equal(mapSerperFreshness({ freshness: { preset: "week" } } as any), "qdr:w");
  assert.equal(mapSerperFreshness({ freshness: { preset: "month" } } as any), "qdr:m");
  assert.equal(mapSerperFreshness({ freshness: { preset: "year" } } as any), "qdr:y");
  assert.equal(mapSerperFreshness(undefined), undefined);
});

test("parseSerperSearchJson handles null/empty/malformed input", () => {
  assert.deepEqual(parseSerperSearchJson(null, 5), []);
  assert.deepEqual(parseSerperSearchJson({}, 5), []);
  assert.deepEqual(parseSerperSearchJson({ organic: "invalid" }, 5), []);
});
