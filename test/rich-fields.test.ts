import test from "node:test";
import assert from "node:assert/strict";
import { TavilyProvider } from "../src/host/providers/tavily.ts";
import { BraveProvider } from "../src/host/providers/brave.ts";
import { SerperProvider } from "../src/host/providers/serper.ts";
import { ExaProvider } from "../src/host/providers/exa.ts";
import { YouProvider } from "../src/host/providers/you.ts";
import { parseJinaSearchJson } from "../src/host/providers/jina.ts";
import {
  formatPlatformSnippet,
  formatPlatformDigest,
  describeDegradation,
  toRoutedSearchResponse,
} from "../src/host/sources/routed-response.ts";
import { truncate, toSingleLine, SNIPPET_MAX, SUMMARY_MAX } from "../src/host/text-limits.ts";
import { SpecializedSourceRegistry } from "../src/host/sources/registry.ts";
import { createSearchProvider } from "../src/host/registry.ts";

test("rich-fields: TavilyProvider extracts raw.answer to top-level content and populates summary", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string);
    assert.equal(body.include_answer, true);
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        answer: "Direct synthesized answer from Tavily LLM.",
        results: [
          {
            url: "https://example.com/item",
            title: "Item Title",
            content: "Item snippet content with detailed explanation.",
            published_date: "2026-03-01T00:00:00Z",
          },
        ],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const res = await TavilyProvider.search("query", 5, "test-token", undefined);
    assert.equal(res.content, "Direct synthesized answer from Tavily LLM.");
    assert.equal(res.sources.length, 1);
    assert.equal(res.sources[0].snippet, "Item snippet content with detailed explanation.");
    assert.equal(res.sources[0].summary, "Item snippet content with detailed explanation.");
    assert.equal(res.sources[0].publishedAt, "2026-03-01T00:00:00Z");
    assert.ok(!res.sources[0].snippet?.includes("\n"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: BraveProvider classic web-search populates single-line snippet and rich summary", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        web: {
          results: [
            {
              url: "https://example.com/brave",
              title: "Brave Result",
              description: "Primary description line.",
              extra_snippets: ["Second detail sentence.", "Third detail sentence."],
              age: "2 days ago",
            },
          ],
        },
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const res = await BraveProvider.search("query", 5, "test-token", undefined, {
      options: { endpointPreference: "web-search" },
    });
    assert.equal(res.sources.length, 1);
    assert.equal(res.sources[0].snippet, "Primary description line.");
    assert.ok(!res.sources[0].snippet?.includes("\n"));
    assert.ok(res.sources[0].summary?.includes("Primary description line.\nSecond detail sentence. Third detail sentence."));
    assert.equal(res.sources[0].publishedAt, "2 days ago");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: SerperProvider maps answerBox / knowledgeGraph to content and attributes to summary", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        knowledgeGraph: {
          title: "Albert Einstein",
          description: "Theoretical physicist widely acknowledged as one of the greatest physicists of all time.",
        },
        organic: [
          {
            title: "Einstein Bio",
            link: "https://example.com/einstein",
            snippet: "Einstein was born in Germany.",
            date: "Nov 5, 2026",
            attributes: {
              Born: "March 14, 1879",
              Died: "April 18, 1955",
            },
          },
        ],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const res = await SerperProvider.search("einstein", 5, "test-token", undefined);
    assert.equal(
      res.content,
      "Albert Einstein: Theoretical physicist widely acknowledged as one of the greatest physicists of all time.",
    );
    assert.equal(res.sources.length, 1);
    assert.equal(res.sources[0].snippet, "Einstein was born in Germany.");
    assert.ok(!res.sources[0].snippet?.includes("\n"));
    assert.equal(res.sources[0].summary, "Einstein was born in Germany.\nBorn: March 14, 1879 | Died: April 18, 1955");
    assert.equal(res.sources[0].publishedAt, "Nov 5, 2026");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: ExaProvider populates concise snippet and rich multiline summary", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        results: [
          {
            url: "https://example.com/paper",
            title: "Deep Learning Foundations",
            author: "Yann LeCun",
            summary: "Comprehensive overview of representation learning.",
            highlights: ["Extracted highlight sentence 1.", "Extracted highlight sentence 2."],
            publishedDate: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const res = await ExaProvider.search("deep learning", 5, "test-token", undefined);
    assert.equal(res.sources.length, 1);
    assert.equal(res.sources[0].snippet, "Extracted highlight sentence 1.");
    assert.ok(!res.sources[0].snippet?.includes("\n"));
    const sum = res.sources[0].summary!;
    assert.ok(sum.includes("[Author: Yann LeCun]"));
    assert.ok(sum.includes("Summary: Comprehensive overview of representation learning."));
    assert.ok(sum.includes("Extracted highlight sentence 1.\n\nExtracted highlight sentence 2."));
    assert.equal(res.sources[0].publishedAt, "2026-01-01T00:00:00Z");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: YouProvider populates single-line snippet and newline-joined summary", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        results: {
          web: [
            {
              url: "https://example.com/you",
              title: "You Result",
              snippets: ["Snippet 1.", "Snippet 2.", "Snippet 3."],
              page_age: "1 week ago",
            },
          ],
        },
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const res = await YouProvider.search("query", 5, "test-token", undefined);
    assert.equal(res.sources.length, 1);
    assert.equal(res.sources[0].snippet, "Snippet 1.");
    assert.ok(!res.sources[0].snippet?.includes("\n"));
    assert.equal(res.sources[0].summary, "Snippet 1.\nSnippet 2.\nSnippet 3.");
    assert.equal(res.sources[0].publishedAt, "1 week ago");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: parseJinaSearchJson populates snippet and summary", () => {
  const body = {
    code: 200,
    status: 20000,
    data: [
      {
        title: "Markdown Document",
        url: "https://example.com/doc",
        content: "# Heading\n\nDetailed document markdown text.",
        publishedTime: "2026-02-01T00:00:00Z",
      },
    ],
  };
  const sources = parseJinaSearchJson(body, 5);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].snippet, "# Heading Detailed document markdown text.");
  assert.ok(!sources[0].snippet?.includes("\n"));
  assert.equal(sources[0].summary, "# Heading\n\nDetailed document markdown text.");
  assert.equal(sources[0].publishedAt, "2026-02-01T00:00:00Z");
});

test("rich-fields: platform formatting enforces single-line snippet ≤200 and rich digest ≤800", () => {
  const longText = "Very detailed review of roast duck in Beijing. ".repeat(40);
  const item = {
    id: "note_1",
    url: "https://xhs.com/note/123",
    title: "Note Title",
    text: longText,
    author: { handle: "chef_john" },
    likes: 1200,
    collects: 340,
    replies: 56,
    tags: ["food", "beijing"],
    platform: "xiaohongshu" as const,
  };

  const snippet = formatPlatformSnippet(item);
  assert.ok(!snippet.includes("\n"), "Snippet must be single-line");
  assert.ok(Array.from(snippet).length <= SNIPPET_MAX, `Snippet must be <= ${SNIPPET_MAX}`);
  assert.ok(snippet.includes("[@chef_john]"));
  assert.ok(snippet.includes("👍 1200 | ⭐ 340 | 💬 56"));

  const digest = formatPlatformDigest(item);
  assert.ok(Array.from(digest).length <= SUMMARY_MAX, `Digest must be <= ${SUMMARY_MAX}`);
  assert.ok(digest.includes("\n\n"));
  assert.ok(digest.includes("[@chef_john]"));
  assert.ok(digest.includes("Very detailed review of roast duck in Beijing."));
});

test("rich-fields: truncate never breaks Unicode code points / emoji surrogate pairs", () => {
  const textWithEmojis = "Heading 👍⭐🔁💬 End";
  // Code points count: "Heading " (8) + 4 emojis + " End" (4) = 16 code points
  const truncatedAt10 = truncate(textWithEmojis, 10);
  assert.equal(truncatedAt10, "Heading 👍…");
  assert.equal(Array.from(truncatedAt10).length, 10);
  // Check no lone surrogates
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(truncatedAt10), false);
});

test("rich-fields: describeDegradation tailors action message to target environment", () => {
  const degradation = {
    code: "auth-required" as const,
    message: "No session",
    platform: "xiaohongshu" as const,
  };
  const dshMsg = describeDegradation(degradation, "dsh");
  assert.ok(dshMsg.includes("settings card"));

  const mcpMsg = describeDegradation(degradation, "mcp");
  assert.ok(mcpMsg.includes("dsh-web-tools-mcp --login xiaohongshu"));
});

test("rich-fields: END-TO-END pipeline preserves content, publishedAt, and summary from provider through registry to response", async () => {
  // Mock provider returning all rich fields
  const mockAdapter = {
    name: "mock-serper",
    label: "Mock Serper",
    description: "Mock",
    credSuffix: "MOCK",
    fetchCapable: false,
    needsBaseUrl: false,
    async search() {
      return {
        content: "Quick Answer: The speed of light is ~300,000 km/s.",
        sources: [
          {
            url: "https://example.com/physics",
            title: "Physics Overview",
            snippet: "The speed of light in vacuum is approximately 299,792 km/s.",
            summary: "The speed of light in vacuum is approximately 299,792 km/s.\nConstant: c | Measured: 1983",
            publishedAt: "2026-05-01T00:00:00Z",
          },
        ],
      };
    },
  };

  const runtimeConfig = () => ({
    enabled: true,
    defaultProvider: "mock-serper",
    fallbackOrder: ["mock-serper"],
    enabledProviders: {},
    providerBaseUrls: {},
    providerAttemptTimeoutMs: 5000,
  });

  const rawSearchProvider = createSearchProvider(runtimeConfig, async () => "mock-key", { record: () => {} }, {
    "mock-serper": mockAdapter as any,
  });

  const registry = new SpecializedSourceRegistry();
  registry.setFallbackProviders(rawSearchProvider, undefined as any);

  // 1. Regular search through registry
  const outcome = await registry.search("speed of light");
  assert.equal(outcome.content, "Quick Answer: The speed of light is ~300,000 km/s.");
  assert.equal(outcome.items.length, 1);
  assert.equal(outcome.items[0].publishedAt, "2026-05-01T00:00:00Z");
  assert.equal(outcome.items[0].summary, "The speed of light in vacuum is approximately 299,792 km/s.\nConstant: c | Measured: 1983");

  // 2. Final routed response for DSH
  const dshResponse = toRoutedSearchResponse(outcome, { target: "dsh" });
  assert.equal(dshResponse.content, "Quick Answer: The speed of light is ~300,000 km/s.");
  assert.equal(dshResponse.sources.length, 1);
  assert.equal(dshResponse.sources[0].publishedAt, "2026-05-01T00:00:00Z");
  assert.equal(dshResponse.sources[0].summary, "The speed of light in vacuum is approximately 299,792 km/s.\nConstant: c | Measured: 1983");
  assert.equal(dshResponse.sources[0].snippet, "The speed of light in vacuum is approximately 299,792 km/s.");

  // 3. Final routed response for MCP
  const mcpResponse = toRoutedSearchResponse(outcome, { target: "mcp" });
  assert.equal(mcpResponse.content, "Quick Answer: The speed of light is ~300,000 km/s.");
  assert.equal(mcpResponse.sources[0].summary, "The speed of light in vacuum is approximately 299,792 km/s.\nConstant: c | Measured: 1983");
  assert.equal(mcpResponse.sources[0].publishedAt, "2026-05-01T00:00:00Z");
});
