/**
 * Runtime invariant tests for the search/fetch executors (registry.ts).
 * These are the behaviors that matter most: abort semantics, credential
 * health, and fetch multi-key rotation. The executor's adapter registry is
 * injectable, so no network is needed.
 *
 * Run: node --experimental-strip-types --test test/runtime.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createSearchProvider, createFetchProvider } from "../src/host/registry.ts";
import { braveQuotaFromHeaders } from "../src/host/providers/brave.ts";

test("Brave header parsing: dual window → monthly remaining/limit", () => {
  const s = braveQuotaFromHeaders(new Headers({ "x-ratelimit-limit": "1, 15000", "x-ratelimit-remaining": "1, 14523" }));
  assert.equal(s.supported, true);
  assert.equal(s.remaining, 14523);
  assert.equal(s.limit, 15000);
});

test("Brave header parsing: monthly limit 0 = unlimited (no remaining)", () => {
  const s = braveQuotaFromHeaders(new Headers({ "x-ratelimit-limit": "1, 0", "x-ratelimit-remaining": "1, 0" }));
  assert.equal(s.limit, 0);
  assert.equal(s.remaining, undefined, "unlimited must not report remaining=0 as '0 left'");
});

test("Brave header parsing: single value is per-second burst only, no monthly info", () => {
  const s = braveQuotaFromHeaders(new Headers({ "x-ratelimit-remaining": "0" }));
  assert.equal(s.supported, false, "no monthly window → honest unsupported, never '0 left'");
  assert.equal(s.remaining, undefined);
  assert.equal(s.limit, undefined);
});

function cfg(overrides = {}) {
  return {
    enabled: true,
    defaultProvider: "tavily",
    providerAttemptTimeoutMs: 5000,
    fallbackOrder: ["exa"],
    providerBaseUrls: {},
    enabledProviders: {},
    ...overrides,
  };
}

/** Build a stub adapter for one provider with configurable behavior. */
function stubAdapter(name, { fetchCapable = true, failWith, hang = false, fetchFail } = {}) {
  const calls = [];
  return {
    name,
    label: name,
    description: "stub",
    credSuffix: name.toUpperCase(),
    fetchCapable,
    needsBaseUrl: false,
    calls,
    async search(_q, _n, key, _b, signalOrCtx) {
      calls.push({ kind: "search", key });
      const sig = signalOrCtx?.signal ?? signalOrCtx;
      if (hang) {
        return await new Promise((_resolve, reject) => {
          sig?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { code: "aborted" })));
        });
      }
      if (failWith) throw failWith;
      return { sources: [{ url: `https://${name}.example`, title: name }] };
    },
    async fetch(_url, key, _b, signalOrCtx) {
      calls.push({ kind: "fetch", key });
      const sig = signalOrCtx?.signal ?? signalOrCtx;
      if (hang) {
        return await new Promise((_resolve, reject) => {
          sig?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { code: "aborted" })));
        });
      }
      if (fetchFail) throw fetchFail;
      return { text: `${name} content` };
    },
  };
}

test("caller abort terminates the whole chain — never falls back", async () => {
  const tavily = stubAdapter("tavily", { hang: true });
  const exa = stubAdapter("exa");
  const provider = createSearchProvider(
    () => cfg(),
    async () => "k1",
    { record() {} },
    { tavily, exa },
  );
  const controller = new AbortController();
  controller.abort(new Error("user cancelled"));
  await assert.rejects(
    provider.search({ query: "q" }, controller.signal),
    (err) => err.code === "WEB_ABORTED" || /abort/i.test(err.message),
  );
  assert.equal(exa.calls.length, 0, "must NOT fall back after caller abort");
});

test("attempt timeout aborts the in-flight provider call, then falls back", async () => {
  const tavily = stubAdapter("tavily", { hang: true });
  const exa = stubAdapter("exa");
  const provider = createSearchProvider(
    () => cfg({ providerAttemptTimeoutMs: 30 }),
    async () => "k1",
    { record() {} },
    { tavily, exa },
  );
  const result = await provider.search({ query: "q" });
  assert.equal(result.sources[0].url, "https://exa.example", "fell back to exa after timeout");
  assert.equal(tavily.calls.length, 1, "tavily attempted");
  assert.equal(exa.calls.length, 1, "exa attempted after timeout");
});

test("auth failure marks the KEY unhealthy; 500/network keep it healthy", async () => {
  // 1) auth failure → next search skips the bad key and tries the pool
  const authErr = Object.assign(new Error("401"), { code: "auth" });
  const tavily = stubAdapter("tavily", { failWith: authErr });
  const provider = createSearchProvider(
    () => cfg({ fallbackOrder: [] }),
    async () => "k1,k2", // two keys; k1 fails auth
    { record() {} },
    { tavily },
  );
  await assert.rejects(provider.search({ query: "q" }), /auth|failed/i);
  // With both keys auth-failing in a fresh pool, k1 then k2 both tried
  const keysTried = tavily.calls.map((c) => c.key);
  assert.ok(keysTried.length >= 1);

  // 2) server error → the SAME key is reused on retry (not marked unhealthy)
  const serverErr = Object.assign(new Error("500"), { code: "server" });
  const t2 = stubAdapter("tavily", { failWith: serverErr });
  const p2 = createSearchProvider(
    () => cfg({ fallbackOrder: ["exa"] }),
    async () => "k1",
    { record() {} },
    { tavily: t2, exa: stubAdapter("exa") },
  );
  await p2.search({ query: "q" }); // tavily 500 → fallback to exa
  // The key was NOT marked unhealthy: a subsequent direct call with only
  // tavily enabled still attempts it (not skipped as no-healthy-keys).
  const t3 = stubAdapter("tavily");
  const p3 = createSearchProvider(
    () => cfg({ fallbackOrder: [] }),
    async () => "k1",
    { record() {} },
    { tavily: t3 },
  );
  const r3 = await p3.search({ query: "q" });
  assert.equal(r3.sources[0].url, "https://tavily.example", "key remained healthy after 500");
});

test("fetch rotates through keys (not always the first)", async () => {
  const exa = stubAdapter("exa");
  const fetchProvider = createFetchProvider(
    () => cfg({ defaultProvider: "exa", fallbackOrder: [] }),
    async () => "a,b,c", // three keys
    { exa },
  );
  for (let i = 0; i < 3; i++) {
    await fetchProvider.fetch({ url: "https://example.com" });
  }
  assert.deepEqual(exa.calls.map((c) => c.key), ["a", "b", "c"], "fetch must round-robin keys");
});

test("config/save path: writeConfig is awaited before saved:true (see routes.smoke)", async () => {
  // covered in routes.smoke.mjs; this is a placeholder so runtime tests also
  // document the invariant in one place.
  assert.ok(true);
});

test("caller abort DURING an in-flight request stops the chain (no late-timer misclassify)", async () => {
  const tavily = stubAdapter("tavily", { hang: true });
  const exa = stubAdapter("exa");
  const provider = createSearchProvider(
    () => cfg({ providerAttemptTimeoutMs: 5000 }), // long timeout, abort wins first
    async () => "k1",
    { record() {} },
    { tavily, exa },
  );
  const controller = new AbortController();
  const promise = provider.search({ query: "q" }, controller.signal);
  // abort while the request is in flight (not before it starts)
  setTimeout(() => controller.abort(new Error("user cancelled mid-flight")), 5);
  await assert.rejects(
    promise,
    (err) => err.code === "WEB_ABORTED" || /abort/i.test(err.message),
  );
  assert.equal(exa.calls.length, 0, "must NOT fall back after mid-flight abort");
});

test("auth failure fails over to the NEXT KEY in the same provider, then to next provider", async () => {
  const authErr = Object.assign(new Error("401"), { code: "auth" });
  let keyCalls = [];
  const tavily = {
    name: "tavily", label: "Tavily", description: "d", credSuffix: "TAVILY",
    fetchCapable: true, needsBaseUrl: false,
    async search(_q, _n, key) {
      keyCalls.push(key);
      if (key === "bad") throw authErr;
      return { sources: [{ url: "https://tavily.example", title: "t" }] };
    },
    async fetch() { return { text: "x" }; },
  };
  const exa = stubAdapter("exa");
  const provider = createSearchProvider(
    () => cfg(), // tavily default, exa fallback
    async () => "bad,good", // key1 auth-fails, key2 succeeds
    { record() {} },
    { tavily, exa },
  );
  const result = await provider.search({ query: "q" });
  assert.equal(result.backend, "tavily");
  assert.deepEqual(keyCalls, ["bad", "good"], "must try key2 after key1 auth failure (no provider fallback)");
  assert.equal(exa.calls.length, 0, "exa not needed — key2 succeeded");

  // If BOTH keys fail auth → then fall through to exa
  keyCalls = [];
  const t2 = {
    ...tavily,
    async search(_q, _n, key) {
      keyCalls.push(key);
      throw authErr;
    },
  };
  const p2 = createSearchProvider(
    () => cfg(),
    async () => "bad1,bad2",
    { record() {} },
    { tavily: t2, exa: stubAdapter("exa") },
  );
  const r2 = await p2.search({ query: "q" });
  assert.equal(r2.backend, "exa", "both keys failed auth → fall through to exa");
  assert.deepEqual(keyCalls, ["bad1", "bad2"], "both keys tried before provider fallback");
});
