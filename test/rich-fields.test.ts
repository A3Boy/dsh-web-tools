import test from "node:test";
import assert from "node:assert/strict";
import { TavilyProvider } from "../src/host/providers/tavily.ts";
import { BraveProvider } from "../src/host/providers/brave.ts";
import { SerperProvider, extractSerperContent } from "../src/host/providers/serper.ts";
import { ExaProvider } from "../src/host/providers/exa.ts";
import { YouProvider } from "../src/host/providers/you.ts";
import { parseJinaSearchJson } from "../src/host/providers/jina.ts";
import { formatPlatformSnippet } from "../src/host/sources/routed-response.ts";

test("rich-fields: TavilyProvider extracts raw.answer to top-level content", async () => {
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
            content: "Item snippet content",
          },
        ],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const res = await TavilyProvider.search("query", 5, "test-token", undefined);
    assert.equal(res.content, "Direct synthesized answer from Tavily LLM.");
    assert.equal(res.sources.length, 1);
    assert.equal(res.sources[0].snippet, "Item snippet content");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: BraveProvider classic web-search merges extra_snippets with description", async () => {
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
    assert.ok(res.sources[0].snippet?.includes("Primary description line."));
    assert.ok(res.sources[0].snippet?.includes("Second detail sentence. Third detail sentence."));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: SerperProvider maps answerBox / knowledgeGraph to content and attributes to snippet", async () => {
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
    assert.ok(res.sources[0].snippet?.includes("Einstein was born in Germany."));
    assert.ok(res.sources[0].snippet?.includes("Born: March 14, 1879 | Died: April 18, 1955"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: ExaProvider includes author and summary in snippet", async () => {
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
            highlights: ["Extracted highlight sentence."],
            publishedDate: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const res = await ExaProvider.search("deep learning", 5, "test-token", undefined);
    assert.equal(res.sources.length, 1);
    const snip = res.sources[0].snippet!;
    assert.ok(snip.includes("[Author: Yann LeCun]"));
    assert.ok(snip.includes("Summary: Comprehensive overview of representation learning."));
    assert.ok(snip.includes("Extracted highlight sentence."));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: YouProvider joins multiple snippets with newline", async () => {
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
            },
          ],
        },
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const res = await YouProvider.search("query", 5, "test-token", undefined);
    assert.equal(res.sources.length, 1);
    assert.equal(res.sources[0].snippet, "Snippet 1.\nSnippet 2.\nSnippet 3.");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: parseJinaSearchJson uses content fallback when description is missing", () => {
  const body = {
    code: 200,
    status: 20000,
    data: [
      {
        title: "Markdown Document",
        url: "https://example.com/doc",
        content: "# Heading\n\nDetailed document markdown text.",
      },
    ],
  };
  const sources = parseJinaSearchJson(body, 5);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].snippet, "# Heading\n\nDetailed document markdown text.");
});

test("rich-fields: formatPlatformSnippet formats author, engagement, and tags", () => {
  const formatted = formatPlatformSnippet({
    url: "https://xhs.com/note/123",
    title: "Note Title",
    text: "Body content of the note",
    author: { handle: "chef_john" },
    likes: 1200,
    collects: 340,
    replies: 56,
    tags: ["food", "beijing"],
  });

  assert.ok(formatted.includes("[@chef_john]"));
  assert.ok(formatted.includes("👍 1200 | ⭐ 340 | 💬 56"));
  assert.ok(formatted.includes("#food #beijing"));
  assert.ok(formatted.includes("Body content of the note"));
});
