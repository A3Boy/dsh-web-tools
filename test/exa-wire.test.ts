import test from "node:test";
import assert from "node:assert/strict";
import { ExaProvider } from "../src/host/providers/exa.ts";

test("ExaProvider search uses headers and parses highlights", async () => {
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
          {
            url: "https://example.com/item1",
            title: "Item 1",
            highlights: [
              "Sentence 1 with high significance.",
              "Sentence 2 providing detailed context.",
            ],
            publishedDate: "2026-03-01T00:00:00.000Z",
          },
          {
            url: "https://example.com/item2",
            title: "Item 2",
            text: "Fallback text when highlights are empty.",
          },
        ],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const outcome = await ExaProvider.search("test query", 10, "test-exa-key", undefined);

    assert.equal(capturedUrl, "https://api.exa.ai/search");
    assert.equal(capturedHeaders["x-api-key"], "test-exa-key");
    assert.equal(capturedBody.query, "test query");
    assert.equal(capturedBody.type, "auto");
    assert.equal(capturedBody.numResults, 10);
    assert.deepEqual(capturedBody.contents, {
      highlights: {
        maxCharacters: 4000,
      },
    });

    assert.equal(outcome.sources.length, 2);
    // highlight paragraphs joined with \n\n
    assert.equal(
      outcome.sources[0].snippet,
      "Sentence 1 with high significance.\n\nSentence 2 providing detailed context."
    );
    assert.equal(outcome.sources[0].publishedAt, "2026-03-01T00:00:00.000Z");
    assert.equal(outcome.sources[1].snippet, "Fallback text when highlights are empty.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
