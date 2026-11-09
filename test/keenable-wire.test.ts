import test from "node:test";
import assert from "node:assert/strict";
import {
  KeenableProvider,
  buildKeenableSearchBody,
  parseKeenableSearchJson,
  keenableQuotaFromHeaders,
  keenableQuota,
} from "../src/host/providers/keenable.ts";
import { resetKeenableBffSession } from "../src/host/providers/keenable-bff.ts";

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

test("KeenableProvider requires an API key and supports fetch", async () => {
  await assert.rejects(() => KeenableProvider.search("q", 5, "", undefined), /API key is not configured/);
  await assert.rejects(() => KeenableProvider.fetch("https://example.com", "", undefined), /API key is not configured/);
  assert.equal(KeenableProvider.fetchCapable, true);
});

test("KeenableProvider fetch calls /v1/fetch with x-api-key and parses json", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return {
      status: 200,
      ok: true,
      headers: {
        get: (h: string) => {
          if (h === "content-type") return "application/json";
          if (h === "x-ratelimit-limit") return "1000";
          if (h === "x-ratelimit-remaining") return "950";
          return null;
        },
      },
      json: async () => ({
        markdown: "# Article Title\n\nContent here",
        title: "Article Title",
        author: "Author Name",
        published_at: "2026-10-15T12:00:00Z",
      }),
      text: async () => "# Article Title\n\nContent here",
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const outcome = await KeenableProvider.fetch("https://example.com/post", "kn-key", undefined);
    assert.equal(capturedUrl, "https://api.keenable.ai/v1/fetch?url=https%3A%2F%2Fexample.com%2Fpost");
    assert.equal(capturedHeaders["x-api-key"], "kn-key");
    assert.equal(capturedHeaders["x-keenable-title"], "dsh-web-tools");
    assert.equal(outcome.text, "# Article Title\n\nContent here");
    assert.equal(outcome.title, "Article Title");
    assert.equal(outcome.author, "Author Name");
    assert.equal(outcome.publishedAt, "2026-10-15T12:00:00Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keenableQuotaFromHeaders parses x-ratelimit headers", () => {
  const headers = {
    "x-ratelimit-limit": "500",
    "x-ratelimit-remaining": "420",
    "x-ratelimit-reset": "1762690000",
  };
  const q = keenableQuotaFromHeaders(headers);
  assert.equal(q.supported, true);
  assert.equal(q.limit, 500);
  assert.equal(q.remaining, 420);
  assert.ok(typeof q.resetAt === "string" && q.resetAt.length > 0);
  assert.equal(q.unit, "requests");

  const emptyQ = keenableQuotaFromHeaders(undefined);
  assert.equal(emptyQ.supported, false);
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

test("a search with a usage object feeds the local quota ledger", async () => {
  delete process.env.KEENABLE_SESSION_TOKEN;
  delete process.env.KEENABLE_REFRESH_TOKEN;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    status: 200,
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      results: [{ url: "https://example.com/a", title: "A" }],
      usage: { sku: "search.pro", amount: 1, credits: 2, paid: false },
    }),
  })) as unknown as typeof globalThis.fetch;
  try {
    await KeenableProvider.search("ledger query", 3, "kn-ledger-key", undefined);
    const quota = await keenableQuota("kn-ledger-key");
    assert.equal(quota.source, "local_estimate");
    assert.equal(quota.authoritative, false);
    assert.equal(quota.unit, "credits");
    assert.equal(quota.used, 2);
    assert.equal(quota.remaining, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keenableQuota prefers the console balance when a session is configured", async () => {
  process.env.KEENABLE_SESSION_TOKEN = "session-token-xyz";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("/bff/organization/balance")) {
      return {
        status: 200,
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => ({ free_credits: 1000, search_spendings: 250 }),
      };
    }
    throw new Error("unexpected url " + String(url));
  }) as unknown as typeof globalThis.fetch;
  try {
    const quota = await keenableQuota("kn-ledger-key");
    assert.equal(quota.source, "api");
    assert.equal(quota.authoritative, true);
    assert.equal(quota.limit, 1000);
    assert.equal(quota.used, 250);
    assert.equal(quota.remaining, 750);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.KEENABLE_SESSION_TOKEN;
    resetKeenableBffSession();
  }
});
