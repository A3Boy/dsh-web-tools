import test from "node:test";
import assert from "node:assert/strict";
import { createFetchPage } from "../src/host/fetch-page.ts";
import { createCachedFetchProvider } from "../src/host/cached-web.ts";

test("createFetchPage: maps body.content, finalUrl, truncated, and backend", async () => {
  const fakeProvider = {
    fetch: async (req: { url: string }) => ({
      url: "https://example.com/final",
      statusCode: 200,
      body: { kind: "text", content: "# Hello World" },
      truncated: false,
      backend: "mock-backend",
    }),
  };

  const fetchPage = createFetchPage(fakeProvider);
  const controller = new AbortController();
  const page = await fetchPage("https://example.com/initial", controller.signal);

  assert.equal(page.content, "# Hello World");
  assert.equal(page.finalUrl, "https://example.com/final");
  assert.equal(page.truncated, false);
  assert.equal(page.backend, "mock-backend");
});

test("createFetchPage: throws when body.kind is not text", async () => {
  const fakeProvider = {
    fetch: async (req: { url: string }) => ({
      url: req.url,
      statusCode: 200,
      body: { kind: "html", content: "<html></html>" },
      truncated: false,
    }),
  };

  const fetchPage = createFetchPage(fakeProvider);
  const controller = new AbortController();
  await assert.rejects(
    () => fetchPage("https://example.com", controller.signal),
    /expected text body but received html/,
  );
});

test("createFetchPage with createCachedFetchProvider: consecutive calls to same URL only hit upstream once", async () => {
  let upstreamCalls = 0;
  const rawProvider = {
    id: "test-fetch",
    available: () => true,
    fetch: async (req: { url: string }) => {
      upstreamCalls++;
      return {
        url: req.url,
        statusCode: 200,
        body: { kind: "text" as const, content: `Content at call ${upstreamCalls}` },
        truncated: false,
        backend: "test",
      };
    },
  };

  const cachedProvider = createCachedFetchProvider(rawProvider, {
    ttlMs: 60000,
    fingerprint: () => "test-fp",
  });

  const fetchPage = createFetchPage(cachedProvider);
  const controller = new AbortController();

  const page1 = await fetchPage("https://example.com/page", controller.signal);
  const page2 = await fetchPage("https://example.com/page", controller.signal);

  assert.equal(upstreamCalls, 1);
  assert.equal(page1.content, "Content at call 1");
  assert.equal(page2.content, "Content at call 1");
});

test("createFetchPage: signal abortion terminates call with AbortError", async () => {
  const controller = new AbortController();
  controller.abort();

  const fakeProvider = {
    fetch: async (req: { url: string }, signal?: AbortSignal) => ({
      url: req.url,
      statusCode: 200,
      body: { kind: "text", content: "Never reached" },
      truncated: false,
    }),
  };

  const fetchPage = createFetchPage(fakeProvider);
  await assert.rejects(
    () => fetchPage("https://example.com", controller.signal),
    (err: any) => err.name === "AbortError",
  );
});

test("createFetchPage: upstream honoring AbortSignal throws AbortError", async () => {
  const controller = new AbortController();

  const fakeProvider = {
    fetch: async (req: { url: string }, signal?: AbortSignal) => {
      return new Promise<any>((_, reject) => {
        signal?.addEventListener("abort", () => {
          const err = new Error("Request aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    },
  };

  const fetchPage = createFetchPage(fakeProvider);
  const promise = fetchPage("https://example.com", controller.signal);
  controller.abort();

  await assert.rejects(
    () => promise,
    (err: any) => err.name === "AbortError",
  );
});
