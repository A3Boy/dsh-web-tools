import test from "node:test";
import assert from "node:assert/strict";
import { createCachedSearchProvider, createCachedFetchProvider, runWithoutCache } from "../src/host/cached-web.ts";

function searchInner(sources: Array<{ url: string }> = [{ url: "https://a.test/1" }]) {
  const state = { calls: 0, sources };
  const provider = {
    id: "inner",
    available: () => true,
    async search() {
      state.calls += 1;
      return { sources: state.sources, truncated: false, backend: "exa", attempts: [{ provider: "exa", outcome: "success", latencyMs: 5 }] } as any;
    },
  };
  return { state, provider };
}

function fetchInner(content = "page body") {
  const state = { calls: 0, content };
  const provider = {
    id: "inner-fetch",
    available: () => true,
    async fetch(request: { url: string }) {
      state.calls += 1;
      return { url: request.url, statusCode: 200, body: { kind: "text" as const, content: state.content }, truncated: false, backend: "builtin-http" };
    },
  };
  return { state, provider };
}

test("cached search: second identical query is served from cache and marked cache-hit", async () => {
  const { state, provider } = searchInner();
  const cached = createCachedSearchProvider(provider, { fingerprint: () => "fp1" });
  const first = await cached.search({ query: "hello  world", maxResults: 5 });
  const second = await cached.search({ query: " hello world ", maxResults: 5 });
  assert.equal(state.calls, 1);
  assert.equal(second.sources.length, 1);
  assert.deepEqual((second as any).attempts, [{ provider: "exa", outcome: "cache-hit" }]);
  assert.equal((first as any).attempts[0].outcome, "success");
});

test("cached search: a configuration change invalidates cached entries", async () => {
  const { state, provider } = searchInner();
  let fp = "fp1";
  const cached = createCachedSearchProvider(provider, { fingerprint: () => fp });
  await cached.search({ query: "q" });
  fp = "fp2";
  await cached.search({ query: "q" });
  assert.equal(state.calls, 2);
});

test("cached search: runWithoutCache neither reads nor writes the cache", async () => {
  const { state, provider } = searchInner();
  const cached = createCachedSearchProvider(provider, { fingerprint: () => "fp" });
  await cached.search({ query: "q" });
  await runWithoutCache(() => cached.search({ query: "q" }));
  assert.equal(state.calls, 2, "bypass must reach the real chain");
  await cached.search({ query: "q" });
  assert.equal(state.calls, 2, "bypass must not have evicted the cached entry");
});

test("cached search: empty results are not cached", async () => {
  const { state, provider } = searchInner([]);
  const cached = createCachedSearchProvider(provider, { fingerprint: () => "fp" });
  await cached.search({ query: "q" });
  await cached.search({ query: "q" });
  assert.equal(state.calls, 2);
});

test("cached search: entries expire after the ttl and failures are not cached", async () => {
  let t = 1000;
  const { state, provider } = searchInner();
  const cached = createCachedSearchProvider(provider, { fingerprint: () => "fp", ttlMs: 100, now: () => t });
  await cached.search({ query: "q" });
  t += 100;
  await cached.search({ query: "q" });
  assert.equal(state.calls, 2);

  let fail = true;
  let calls = 0;
  const flaky = createCachedSearchProvider(
    {
      id: "flaky",
      available: () => true,
      async search() {
        calls += 1;
        if (fail) throw new Error("upstream down");
        return { sources: [{ url: "https://a.test/ok" }], truncated: false };
      },
    },
    { fingerprint: () => "fp" },
  );
  await assert.rejects(flaky.search({ query: "q" }), /upstream down/);
  fail = false;
  assert.equal((await flaky.search({ query: "q" })).sources.length, 1);
  assert.equal(calls, 2);
});

test("cached search: concurrent identical queries share one upstream call", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const cached = createCachedSearchProvider(
    {
      id: "slow",
      available: () => true,
      async search() {
        calls += 1;
        await gate;
        return { sources: [{ url: "https://a.test/1" }], truncated: false };
      },
    },
    { fingerprint: () => "fp" },
  );
  const p1 = cached.search({ query: "q" });
  const p2 = cached.search({ query: "q" });
  release();
  await Promise.all([p1, p2]);
  assert.equal(calls, 1);
});

test("cached fetch: same URL (ignoring fragment) is cached; empty content is not", async () => {
  const { state, provider } = fetchInner();
  const cached = createCachedFetchProvider(provider, { fingerprint: () => "fp" });
  await cached.fetch({ url: "https://a.test/x#top" });
  const second = await cached.fetch({ url: "https://a.test/x" });
  assert.equal(state.calls, 1);
  assert.equal(second.body.content, "page body");

  const empty = fetchInner("   ");
  const cachedEmpty = createCachedFetchProvider(empty.provider, { fingerprint: () => "fp" });
  await cachedEmpty.fetch({ url: "https://a.test/y" });
  await cachedEmpty.fetch({ url: "https://a.test/y" });
  assert.equal(empty.state.calls, 2);
});

test("cached fetch: clear() drops every entry", async () => {
  const { state, provider } = fetchInner();
  const cached = createCachedFetchProvider(provider, { fingerprint: () => "fp" });
  await cached.fetch({ url: "https://a.test/x" });
  cached.clear();
  await cached.fetch({ url: "https://a.test/x" });
  assert.equal(state.calls, 2);
});

test("cached providers preserve the host cancellation code on hits and misses", async () => {
  const search = createCachedSearchProvider(searchInner().provider, { fingerprint: () => "fp" });
  const fetch = createCachedFetchProvider(fetchInner().provider, { fingerprint: () => "fp" });
  for (let i = 0; i < 2; i++) {
    await assert.rejects(search.search({ query: "q" }, AbortSignal.abort()), { code: "WEB_ABORTED" });
    await assert.rejects(fetch.fetch({ url: "https://a.test/x" }, AbortSignal.abort()), { code: "WEB_ABORTED" });
    await search.search({ query: "q" });
    await fetch.fetch({ url: "https://a.test/x" });
  }
});

test("cached fetch preserves the requested URL and does not cache HTTP errors", async () => {
  const cached = createCachedFetchProvider(fetchInner().provider, { fingerprint: () => "fp" });
  await cached.fetch({ url: "https://a.test/x#first" });
  assert.equal((await cached.fetch({ url: "https://a.test/x#second" })).url, "https://a.test/x#second");
  let calls = 0;
  const errors = createCachedFetchProvider({ ...fetchInner().provider, async fetch(request) {
    calls += 1;
    return { url: request.url, statusCode: 503, body: { kind: "text", content: "unavailable" }, truncated: false };
  } }, { fingerprint: () => "fp" });
  await errors.fetch({ url: "https://a.test/x" });
  await errors.fetch({ url: "https://a.test/x" });
  assert.equal(calls, 2);
});

test("cached results cannot be mutated by callers, including the first caller", async () => {
  const search = createCachedSearchProvider(searchInner().provider, { fingerprint: () => "fp" });
  const first = await search.search({ query: "q" });
  first.sources[0].url = "corrupted";
  assert.equal((await search.search({ query: "q" })).sources[0].url, "https://a.test/1");
  const fetch = createCachedFetchProvider(fetchInner().provider, { fingerprint: () => "fp" });
  (await fetch.fetch({ url: "https://a.test/x" })).body.content = "corrupted";
  assert.equal((await fetch.fetch({ url: "https://a.test/x" })).body.content, "page body");
});

test("clear during a request prevents joining or caching the old request", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let calls = 0;
  const cached = createCachedFetchProvider({
    ...fetchInner().provider,
    async fetch(request) {
      const n = ++calls;
      if (n === 1) await gate;
      return { url: request.url, statusCode: 200, body: { kind: "text", content: String(n) }, truncated: false };
    },
  }, { fingerprint: () => "fp" });
  const old = cached.fetch({ url: "https://a.test/x" });
  await new Promise((r) => setImmediate(r));
  cached.clear();
  const fresh = cached.fetch({ url: "https://a.test/x" });
  release();
  await old;
  assert.equal((await fresh).body.content, "2");
  assert.equal((await cached.fetch({ url: "https://a.test/x" })).body.content, "2");
});
