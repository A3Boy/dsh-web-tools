/**
 * End-to-end retrieval-strategy wiring tests.
 *
 * These exercise `createSearchProvider` (not the helper modules) because the
 * original defect was precisely that hedged/RRF lived in isolated files with no
 * caller: a unit-tested helper proves nothing about what a search actually does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createSearchProvider, type ProviderAdapterLike } from "../src/host/registry.ts";
import type { RetrievalStrategy } from "../src/shared/api-types.ts";

interface FakeSpec {
  name: string;
  delayMs?: number;
  sources?: Array<{ url: string; title?: string }>;
  fail?: boolean;
  onAbort?: () => void;
}

function fakeAdapter(spec: FakeSpec, calls: string[]): ProviderAdapterLike {
  return {
    name: spec.name,
    needsBaseUrl: false,
    fetchCapable: false,
    async search(_query, _max, _key, _baseUrl, contextOrSignal) {
      calls.push(spec.name);
      const signal = (contextOrSignal as { signal?: AbortSignal } | undefined)?.signal;
      if (signal) {
        if (signal.aborted) {
          spec.onAbort?.();
          throw Object.assign(new Error("aborted"), { code: "aborted" });
        }
        signal.addEventListener("abort", () => spec.onAbort?.(), { once: true });
      }
      if (spec.delayMs) await new Promise((resolve) => setTimeout(resolve, spec.delayMs));
      if (spec.fail) throw Object.assign(new Error(`${spec.name} failed`), { code: "network" });
      return { sources: spec.sources ?? [{ url: `https://${spec.name}.example/1`, title: spec.name }] };
    },
    async fetch() {
      throw new Error("not implemented");
    },
  };
}

function buildProvider(
  specs: FakeSpec[],
  strategy: string,
  calls: string[],
  hedgeDelayMs?: number,
) {
  const adapters: Record<string, ProviderAdapterLike> = {};
  for (const spec of specs) adapters[spec.name] = fakeAdapter(spec, calls);

  return createSearchProvider(
    () => ({
      enabled: true,
      defaultProvider: specs[0].name,
      fallbackOrder: specs.slice(1).map((s) => s.name),
      providerAttemptTimeoutMs: 2000,
      searchRoutingPolicy: "ordered",
      // Deliberately a plain string: the executor must validate at runtime.
      retrievalStrategy: strategy as RetrievalStrategy,
      providerBaseUrls: {},
      enabledProviders: {},
      ...(hedgeDelayMs !== undefined ? { hedgeDelayMs } : {}),
    }),
    async () => "test-key",
    { record: () => {} },
    adapters,
  );
}

test("retrieval: single strategy calls exactly one provider", async () => {
  const calls: string[] = [];
  const provider = buildProvider(
    [
      { name: "alpha", sources: [{ url: "https://alpha.example/1" }] },
      { name: "beta", sources: [{ url: "https://beta.example/1" }] },
    ],
    "single",
    calls,
  );

  const result = await provider.search({ query: "q" });
  assert.deepEqual(calls, ["alpha"]);
  assert.equal(result.backend, "alpha");
  assert.ok(!result.fused);
});

test("retrieval: fused runs both providers and merges their lists", async () => {
  const calls: string[] = [];
  const provider = buildProvider(
    [
      {
        name: "alpha",
        delayMs: 10,
        sources: [{ url: "https://shared.example/page", title: "shared from alpha" }, { url: "https://alpha.example/1" }],
      },
      {
        name: "beta",
        delayMs: 10,
        sources: [{ url: "https://beta.example/1" }, { url: "https://shared.example/page?utm_source=x", title: "shared from beta" }],
      },
    ],
    "fused",
    calls,
  );

  const result = await provider.search({ query: "q" });
  assert.deepEqual(calls.sort(), ["alpha", "beta"]);
  assert.equal(result.fused, true);
  assert.equal(result.backend, "alpha+beta");
  assert.equal(result.sources.length, 3, "the shared URL must be merged, not duplicated");
  assert.equal(result.sources[0].url, "https://shared.example/page");
});

test("retrieval: hedged returns the fast primary without touching the second provider", async () => {
  const calls: string[] = [];
  const provider = buildProvider(
    [
      { name: "alpha", sources: [{ url: "https://alpha.example/1" }] },
      { name: "beta", sources: [{ url: "https://beta.example/1" }] },
    ],
    "hedged",
    calls,
    50,
  );

  const result = await provider.search({ query: "q" });
  assert.deepEqual(calls, ["alpha"]);
  assert.equal(result.backend, "alpha");
});

test("retrieval: hedged launches the second provider when the first is slow", async () => {
  const calls: string[] = [];
  const provider = buildProvider(
    [
      { name: "alpha", delayMs: 300, sources: [{ url: "https://alpha.example/slow" }] },
      { name: "beta", delayMs: 10, sources: [{ url: "https://beta.example/fast" }] },
    ],
    "hedged",
    calls,
    30,
  );

  const result = await provider.search({ query: "q" });
  assert.deepEqual(calls, ["alpha", "beta"]);
  assert.equal(result.backend, "beta");
  assert.equal(result.sources[0].url, "https://beta.example/fast");
  // The hedged ledger must record both lanes for the settings card.
  assert.ok((result.attempts ?? []).some((a) => a.provider === "beta"));
});

test("retrieval: fused falls back to the rest of the chain when both lanes fail", async () => {
  const calls: string[] = [];
  const provider = buildProvider(
    [
      { name: "alpha", fail: true },
      { name: "beta", fail: true },
      { name: "gamma", sources: [{ url: "https://gamma.example/1" }] },
    ],
    "fused",
    calls,
  );

  const result = await provider.search({ query: "q" });
  assert.deepEqual(calls.sort(), ["alpha", "beta", "gamma"]);
  assert.equal(result.backend, "gamma");
  assert.equal(result.sources[0].url, "https://gamma.example/1");
});

test("retrieval: an unknown strategy value degrades to the single chain", async () => {
  const calls: string[] = [];
  const provider = buildProvider(
    [
      { name: "alpha", sources: [{ url: "https://alpha.example/1" }] },
      { name: "beta", sources: [{ url: "https://beta.example/1" }] },
    ],
    "nonsense",
    calls,
  );

  const result = await provider.search({ query: "q" });
  assert.deepEqual(calls, ["alpha"]);
  assert.equal(result.backend, "alpha");
});
