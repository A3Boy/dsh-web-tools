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
import { extractSearchHints } from "../src/host/search-hints.ts";
import { XiaohongshuSource } from "../src/host/sources/xiaohongshu.ts";
import type { NativeBrowserRuntime } from "../src/host/browser/types.ts";

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
    coverImage: "https://sns-img-hw.xhscdn.com/1040g-cover?imageView2/2/w/format/png",
    platform: "xiaohongshu" as const,
  };

  const snippet = formatPlatformSnippet(item);
  assert.ok(!snippet.includes("\n"), "Snippet must be single-line");
  assert.ok(Array.from(snippet).length <= SNIPPET_MAX, `Snippet must be <= ${SNIPPET_MAX}`);
  assert.ok(snippet.includes("[@chef_john]"));
  assert.ok(snippet.includes("likes 1200 | collects 340 | replies 56"));

  const digest = formatPlatformDigest(item);
  assert.ok(Array.from(digest).length <= SUMMARY_MAX, `Digest must be <= ${SUMMARY_MAX}`);
  assert.ok(digest.includes("\n\n"));
  assert.ok(digest.includes("[@chef_john]"));
  assert.ok(digest.includes("Very detailed review of roast duck in Beijing."));
  assert.ok(
    digest.includes("Cover: https://sns-img-hw.xhscdn.com/1040g-cover"),
    "the cover URL must reach the model-facing summary",
  );

  // No cover → no empty "Cover:" line.
  const withoutCover = formatPlatformDigest({ ...item, coverImage: undefined });
  assert.ok(!withoutCover.includes("Cover:"));

  // images[0] is used when coverImage is absent.
  const withImages = formatPlatformDigest({ ...item, coverImage: undefined, images: ["https://img/1.jpg"] });
  assert.ok(withImages.includes("Cover: https://img/1.jpg"));
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

test("rich-fields: platform degradation preserves general provider summary, publishedAt, and top-level content", async () => {
  const fakeRuntime: NativeBrowserRuntime = {
    detect: async () => ({ kind: "edge", executablePath: "msedge.exe" }),
    status: async () => ({
      platform: "xiaohongshu",
      runtimeAvailable: true,
      runtimeState: "ready",
      authState: "unauthenticated",
      authenticated: false,
    }),
    login: async () => ({} as any),
    checkAuthentication: async () => false,
    verifyAuthenticationForOperation: async () => false,
    openPage: async () => { throw new Error("not called"); },
    createPage: async () => { throw new Error("not called"); },
    resetSession: async () => {},
    stop: async () => {},
    dispose: async () => {},
  };

  const longFallbackSummary =
    "Detailed guide to Hangzhou West Lake tea houses: 1. Longjing Village private house with scenic terrace. 2. Maojiabu quiet waterside pavilions with traditional Longjing brewing. 3. Faxi Temple valley tea rooms with vegetarian lunch and peaceful atmosphere. ".repeat(2);

  const mockFallbackProvider = {
    id: "mock-general",
    available: () => true,
    search: async () => ({
      content: "Synthesized direct overview from general search backend.",
      sources: [
        {
          url: "https://www.xiaohongshu.com/discovery/item/66668888",
          title: "Hangzhou West Lake Tea Guide",
          snippet: "A comprehensive guide to the best tea houses around West Lake Hangzhou.",
          summary: longFallbackSummary,
          publishedAt: "2026-04-12T10:00:00Z",
        },
      ],
      truncated: false,
    }),
  };

  const registry = new SpecializedSourceRegistry();
  const xhsSource = new XiaohongshuSource(fakeRuntime);
  registry.registerSource(xhsSource);
  registry.setFallbackProviders(mockFallbackProvider as any, undefined as any);

  // Search platform topic requiring native source
  const hints = extractSearchHints("小红书 杭州西湖茶室推荐");
  const outcome = await registry.search("小红书 杭州西湖茶室推荐", { hints });
  assert.equal(outcome.retrievalMode, "degraded-web");
  assert.equal(outcome.degraded?.code, "auth-required");
  assert.equal(outcome.degraded?.platform, "xiaohongshu");
  assert.equal(outcome.content, "Synthesized direct overview from general search backend.");
  assert.equal(outcome.items.length, 1);
  assert.equal(outcome.items[0].platform, "xiaohongshu");
  assert.equal(outcome.items[0].summary, longFallbackSummary);
  assert.equal(outcome.items[0].publishedAt, "2026-04-12T10:00:00Z");

  // DSH Response mapping
  const dshRes = toRoutedSearchResponse(outcome, { target: "dsh" });
  assert.ok(dshRes.content?.includes("there is no signed-in Xiaohongshu browser session"));
  assert.ok(dshRes.content?.includes("Synthesized direct overview from general search backend."));
  assert.equal(dshRes.sources.length, 1);
  assert.equal(dshRes.sources[0].summary, longFallbackSummary);
  assert.equal(dshRes.sources[0].snippet, "A comprehensive guide to the best tea houses around West Lake Hangzhou.");
  assert.equal(dshRes.sources[0].publishedAt, "2026-04-12T10:00:00Z");

  // MCP Response mapping
  const mcpRes = toRoutedSearchResponse(outcome, { target: "mcp" });
  assert.ok(mcpRes.content?.includes("dsh-web-tools-mcp --login xiaohongshu"));
  assert.ok(mcpRes.content?.includes("Synthesized direct overview from general search backend."));
  assert.equal(mcpRes.sources[0].summary, longFallbackSummary);
  assert.equal(mcpRes.sources[0].publishedAt, "2026-04-12T10:00:00Z");
});

test("rich-fields: fused retrieval strategy preserves longer summary and direct content end-to-end", async () => {
  const mockAdapter1 = {
    name: "source-a",
    label: "Source A",
    description: "Mock A",
    credSuffix: "A",
    fetchCapable: false,
    needsBaseUrl: false,
    async search() {
      return {
        content: "Direct answer from Source A.",
        sources: [
          {
            url: "https://example.com/shared",
            title: "Shared Article",
            snippet: "Short snippet from A.",
            summary: "Short summary.",
            publishedAt: "2026-01-01",
          },
        ],
      };
    },
  };

  const longerSummary =
    "Much more comprehensive and informative summary provided by Source B, containing rich descriptions, data points, and context about the topic.".repeat(3);

  const mockAdapter2 = {
    name: "source-b",
    label: "Source B",
    description: "Mock B",
    credSuffix: "B",
    fetchCapable: false,
    needsBaseUrl: false,
    async search() {
      return {
        content: "Direct answer from Source B.",
        sources: [
          {
            url: "https://example.com/shared",
            title: "Shared Article Full Title",
            snippet: "Snippet from B.",
            summary: longerSummary,
            publishedAt: "2026-01-01",
          },
        ],
      };
    },
  };

  const runtimeConfig = () => ({
    enabled: true,
    defaultProvider: "source-a",
    fallbackOrder: ["source-b"],
    retrievalStrategy: "fused" as const,
    enabledProviders: {},
    providerBaseUrls: {},
    providerAttemptTimeoutMs: 5000,
  });

  const searchProvider = createSearchProvider(runtimeConfig, async () => "key", { record: () => {} }, {
    "source-a": mockAdapter1 as any,
    "source-b": mockAdapter2 as any,
  });

  const registry = new SpecializedSourceRegistry();
  registry.setFallbackProviders(searchProvider, undefined as any);

  const outcome = await registry.search("shared topic");
  assert.equal(outcome.fused, true);
  assert.equal(outcome.items.length, 1);
  assert.equal(outcome.items[0].summary, longerSummary);

  const routed = toRoutedSearchResponse(outcome, { target: "dsh" });
  assert.equal(routed.sources.length, 1);
  assert.equal(routed.sources[0].summary, truncate(longerSummary, SUMMARY_MAX));
});

test("rich-fields: all six providers enforce snippet <= 200 (single line) and summary <= 800 under long input", async () => {
  const origFetch = globalThis.fetch;
  const veryLongText = "A very long detailed narrative paragraph ".repeat(30); // ~1260 chars

  try {
    // 1. Tavily
    globalThis.fetch = (async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        results: [{ url: "https://tavily.com", title: "Tavily", content: "Line 1\nLine 2\n" + veryLongText }],
      }),
    })) as typeof globalThis.fetch;
    const tavilyRes = await TavilyProvider.search("q", 1, "k", undefined);
    assert.ok(Array.from(tavilyRes.sources[0].snippet!).length <= SNIPPET_MAX);
    assert.ok(!tavilyRes.sources[0].snippet!.includes("\n"));
    assert.ok(Array.from(tavilyRes.sources[0].summary!).length <= SUMMARY_MAX);

    // 2. Exa
    globalThis.fetch = (async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        results: [{
          url: "https://exa.ai",
          title: "Exa",
          text: "Multi\nline\n" + veryLongText,
          highlights: ["Highlight line 1\nHighlight line 2 " + veryLongText],
        }],
      }),
    })) as typeof globalThis.fetch;
    const exaRes = await ExaProvider.search("q", 1, "k", undefined);
    assert.ok(Array.from(exaRes.sources[0].snippet!).length <= SNIPPET_MAX);
    assert.ok(!exaRes.sources[0].snippet!.includes("\n"));
    assert.ok(Array.from(exaRes.sources[0].summary!).length <= SUMMARY_MAX);

    // 3. Brave
    globalThis.fetch = (async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        web: {
          results: [{
            url: "https://brave.com",
            title: "Brave",
            description: "Description\nwith newline " + veryLongText,
            extra_snippets: ["Extra 1\nExtra 2 " + veryLongText],
          }],
        },
      }),
    })) as typeof globalThis.fetch;
    const braveRes = await BraveProvider.search("q", 1, "k", undefined, { options: { endpointPreference: "web-search" } });
    assert.ok(Array.from(braveRes.sources[0].snippet!).length <= SNIPPET_MAX);
    assert.ok(!braveRes.sources[0].snippet!.includes("\n"));
    assert.ok(Array.from(braveRes.sources[0].summary!).length <= SUMMARY_MAX);

    // 4. Jina
    const jinaParsed = parseJinaSearchJson({
      data: [{
        url: "https://jina.ai",
        title: "Jina",
        description: "Desc\nnewline " + veryLongText,
        content: "Content\nnewline " + veryLongText,
      }],
    }, 1);
    assert.ok(Array.from(jinaParsed[0].snippet!).length <= SNIPPET_MAX);
    assert.ok(!jinaParsed[0].snippet!.includes("\n"));
    assert.ok(Array.from(jinaParsed[0].summary!).length <= SUMMARY_MAX);

    // 5. Serper
    globalThis.fetch = (async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        organic: [{
          link: "https://serper.dev",
          title: "Serper",
          snippet: "Snippet\nwith line " + veryLongText,
          attributes: { "Detail 1": "Val 1\nVal 2 " + veryLongText },
        }],
      }),
    })) as typeof globalThis.fetch;
    const serperRes = await SerperProvider.search("q", 1, "k", undefined);
    assert.ok(Array.from(serperRes.sources[0].snippet!).length <= SNIPPET_MAX);
    assert.ok(!serperRes.sources[0].snippet!.includes("\n"));
    assert.ok(Array.from(serperRes.sources[0].summary!).length <= SUMMARY_MAX);

    // 6. You
    globalThis.fetch = (async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        hits: [{
          url: "https://you.com",
          title: "You",
          snippets: ["Snippet line 1\nSnippet line 2 " + veryLongText, "Another snippet " + veryLongText],
          description: "Desc\nwith line " + veryLongText,
        }],
      }),
    })) as typeof globalThis.fetch;
    const youRes = await YouProvider.search("q", 1, "k", undefined);
    assert.ok(Array.from(youRes.sources[0].snippet!).length <= SNIPPET_MAX);
    assert.ok(!youRes.sources[0].snippet!.includes("\n"));
    assert.ok(Array.from(youRes.sources[0].summary!).length <= SUMMARY_MAX);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rich-fields: native search content announces covers in source order", () => {
  const base = {
    author: { name: "作者" },
    likes: 12,
    platform: "xiaohongshu" as const,
    text: "正文",
  };
  const outcome = {
    retrievalMode: "native-browser" as const,
    items: [
      { ...base, id: "a", url: "https://xhs/1", title: "一", coverImage: "https://img/cover-a.png" },
      { ...base, id: "b", url: "https://xhs/2", title: "二" },
      { ...base, id: "c", url: "https://xhs/3", title: "三", images: ["https://img/first-c.png"] },
    ],
  } as any;

  const response = toRoutedSearchResponse(outcome);
  assert.ok(response.content, "covers must reach the model-facing content");
  assert.ok(response.content!.includes("Covers (index matches the source order below):"));
  assert.ok(response.content!.includes("1. https://img/cover-a.png"));
  assert.ok(response.content!.includes("3. https://img/first-c.png"));
  assert.ok(!response.content!.includes("2. "), "a source without a cover must not get a placeholder line");
  assert.ok(
    !response.content!.includes("Human-in-the-Loop Guidance for Assistant"),
    "must not inject prompt guidance coercing the assistant into markdown card rendering",
  );

  // Degraded results are general web hits; their covers must not be advertised.
  const degraded = toRoutedSearchResponse({ ...outcome, degraded: { code: "auth-required", platform: "xiaohongshu" } });
  assert.ok(!/Covers \(index/.test(degraded.content ?? ""));
  assert.ok(!/Human-in-the-Loop/.test(degraded.content ?? ""));
});
