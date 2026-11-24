import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultSizeOf,
  createResultCache,
  createCoalescer,
  cachedCall,
  normalizeQuery,
  searchCacheKey,
  fetchCacheKey,
  fingerprint,
} from "../src/host/result-cache.ts";

test("cache size counts UTF-8 bytes", () => {
  assert.equal(defaultSizeOf("中文"), Buffer.byteLength(JSON.stringify("中文")));
});

test("cachedCall rejects an aborted caller even on a cache hit", async () => {
  const cache = createResultCache<string>({ ttlMs: 1000, maxEntries: 5 });
  cache.set("k", "old");
  await assert.rejects(cachedCall({ cache, coalescer: createCoalescer(), key: "k",
    factory: async () => "new", signal: AbortSignal.abort() }), { code: "aborted" });
});

test("cancelled upstream work cannot overwrite a newer cached result", async () => {
  const cache = createResultCache<string>({ ttlMs: 1000, maxEntries: 5 });
  const coalescer = createCoalescer<string>();
  const d = deferred();
  const ac = new AbortController();
  const old = cachedCall({ cache, coalescer, key: "k", signal: ac.signal,
    factory: async () => { await d.gate; return "old"; } });
  await new Promise((r) => setImmediate(r));
  ac.abort();
  await assert.rejects(old, { code: "aborted" });
  await cachedCall({ cache, coalescer, key: "k", factory: async () => "new" });
  d.release();
  await new Promise((r) => setImmediate(r));
  assert.equal(cache.get("k"), "new");
});

function clock(start = 1000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function deferred() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release: () => release() };
}

test("cache: entry expires after ttl", () => {
  const c = clock();
  const cache = createResultCache<string>({ ttlMs: 100, maxEntries: 10, now: c.now });
  cache.set("a", "v");
  assert.equal(cache.get("a"), "v");
  c.advance(100);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 0);
});

test("cache: LRU eviction by entry count keeps recently read entries", () => {
  const cache = createResultCache<string>({ ttlMs: 1000, maxEntries: 2 });
  cache.set("a", "1");
  cache.set("b", "2");
  assert.equal(cache.get("a"), "1");
  cache.set("c", "3");
  assert.equal(cache.get("b"), undefined, "least recently used entry is evicted");
  assert.equal(cache.get("a"), "1");
  assert.equal(cache.get("c"), "3");
});

test("cache: byte cap evicts oldest and never caches a single oversize value", () => {
  const cache = createResultCache<string>({
    ttlMs: 1000,
    maxEntries: 10,
    maxBytes: 10,
    sizeOf: (v) => String(v).length,
  });
  cache.set("a", "xxxx");
  cache.set("b", "yyyy");
  cache.set("c", "zzzz");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "yyyy");
  assert.equal(cache.get("c"), "zzzz");
  assert.equal(cache.bytes, 8);
  cache.set("d", "x".repeat(11));
  assert.equal(cache.get("d"), undefined);
  assert.equal(cache.get("b"), "yyyy", "an oversize insert must not flush the cache");
});

test("keys: queries are normalized, config and maxResults split entries", () => {
  assert.equal(normalizeQuery("  hello   world \n"), "hello world");
  const fp = fingerprint({ defaultProvider: "exa" });
  assert.equal(searchCacheKey("hello  world", 5, fp), searchCacheKey(" hello world", 5, fp));
  assert.notEqual(searchCacheKey("hello world", 5, fp), searchCacheKey("hello world", 10, fp));
  assert.notEqual(searchCacheKey("hello world", 5, fp), searchCacheKey("hello world", 5, fingerprint({ defaultProvider: "tavily" })));
  assert.equal(fetchCacheKey("https://a.test/x#top", fp), fetchCacheKey("https://a.test/x", fp));
  assert.notEqual(fetchCacheKey("https://a.test/x?p=1", fp), fetchCacheKey("https://a.test/x?p=2", fp));
});

test("fingerprint: independent of key order, sensitive to values", () => {
  assert.equal(fingerprint({ a: 1, b: { c: 2, d: 3 } }), fingerprint({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});

test("coalescer: concurrent callers share one factory run", async () => {
  const d = deferred();
  let calls = 0;
  const co = createCoalescer<string>();
  const factory = async () => {
    calls += 1;
    await d.gate;
    return "ok";
  };
  const p1 = co.run("k", factory);
  const p2 = co.run("k", factory);
  d.release();
  assert.deepEqual(await Promise.all([p1, p2]), ["ok", "ok"]);
  assert.equal(calls, 1);
  assert.equal(co.size, 0);
});

test("coalescer: one caller aborting does not abort the shared work", async () => {
  const d = deferred();
  let underlying: AbortSignal | undefined;
  const co = createCoalescer<string>();
  const factory = async (s: AbortSignal) => {
    underlying = s;
    await d.gate;
    return "ok";
  };
  const ac = new AbortController();
  const p1 = co.run("k", factory, ac.signal);
  const p2 = co.run("k", factory);
  ac.abort();
  await assert.rejects(p1, { code: "aborted" });
  assert.equal(underlying?.aborted, false);
  d.release();
  assert.equal(await p2, "ok");
});

test("coalescer: aborting every caller aborts the work and a new caller starts fresh", async () => {
  const d = deferred();
  const signals: AbortSignal[] = [];
  let calls = 0;
  const co = createCoalescer<string>();
  const factory = async (s: AbortSignal) => {
    calls += 1;
    signals.push(s);
    await d.gate;
    return "ok";
  };
  const a1 = new AbortController();
  const a2 = new AbortController();
  const p1 = co.run("k", factory, a1.signal);
  const p2 = co.run("k", factory, a2.signal);
  a1.abort();
  a2.abort();
  await assert.rejects(p1, { code: "aborted" });
  await assert.rejects(p2, { code: "aborted" });
  assert.equal(signals[0].aborted, true);

  const p3 = co.run("k", factory);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2, "a cancelled call must not be joined by new callers");
  d.release();
  assert.equal(await p3, "ok");
});

test("coalescer: an already-aborted signal rejects without running the factory", async () => {
  const co = createCoalescer<string>();
  let calls = 0;
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    co.run("k", async () => {
      calls += 1;
      return "ok";
    }, ac.signal),
    { code: "aborted" },
  );
  assert.equal(calls, 0);
});

test("cachedCall: miss then hit, bypass neither reads nor writes, failures are not cached", async () => {
  const cache = createResultCache<string>({ ttlMs: 1000, maxEntries: 5 });
  const coalescer = createCoalescer<string>();
  let n = 0;
  const factory = async () => `v${++n}`;

  assert.deepEqual(await cachedCall({ cache, coalescer, key: "k", factory }), { value: "v1", cacheHit: false });
  assert.deepEqual(await cachedCall({ cache, coalescer, key: "k", factory }), { value: "v1", cacheHit: true });
  assert.equal(n, 1);

  const bypassed = await cachedCall({ cache, coalescer, key: "k", factory, bypass: true });
  assert.deepEqual(bypassed, { value: "v2", cacheHit: false });
  assert.equal(cache.get("k"), "v1", "bypass must not overwrite the cached entry");

  await assert.rejects(
    cachedCall({
      cache,
      coalescer,
      key: "bad",
      factory: async () => {
        throw new Error("boom");
      },
    }),
    /boom/,
  );
  assert.equal(cache.get("bad"), undefined);
});
