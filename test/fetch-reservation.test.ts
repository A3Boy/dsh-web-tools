import assert from "node:assert/strict";
import test from "node:test";
import { createFetchProvider, type WebToolsRuntimeConfig } from "../src/host/registry.ts";
import { buildPool } from "../src/host/pool.ts";

test("Phase 5: 1. Fetch key reservation: concurrent fetches reserve different available keys and release them", async () => {
  const keys = "key1,key2";
  const poolEntries = buildPool(keys);
  const poolStore = {
    poolOf: async () => poolEntries,
  };

  const resolveConfig = (): WebToolsRuntimeConfig => ({
    enabled: true,
    defaultProvider: "tavily",
    providerAttemptTimeoutMs: 5000,
    fallbackOrder: [],
    providerBaseUrls: {},
    enabledProviders: { tavily: true },
  });

  const usedKeys: string[] = [];
  const fakeAdapter = {
    name: "tavily",
    needsBaseUrl: false,
    fetchCapable: true,
    search: async () => ({ sources: [] }),
    fetch: async (_url: string, apiKey: string) => {
      usedKeys.push(apiKey);
      // While in flight, inFlight should be > 0
      const activeEntry = poolEntries.find((e) => e.key === apiKey);
      assert.equal(activeEntry?.inFlight, 1);
      await new Promise((r) => setTimeout(r, 20));
      return { text: "fetched text" };
    },
  };

  const fetchProvider = createFetchProvider(
    resolveConfig,
    async () => keys,
    { tavily: fakeAdapter },
    poolStore as any,
  );

  const [res1, res2] = await Promise.all([
    fetchProvider.fetch({ url: "https://example.com/1" }),
    fetchProvider.fetch({ url: "https://example.com/2" }),
  ]);

  assert.equal(res1.body.content, "fetched text");
  assert.equal(res2.body.content, "fetched text");
  assert.equal(usedKeys.length, 2);
  assert.notEqual(usedKeys[0], usedKeys[1]); // Used different keys concurrently

  // After all completed, inFlight must be 0 for all keys
  for (const entry of poolEntries) {
    assert.equal(entry.inFlight, 0);
  }
});

test("Phase 5: 2. Fetch timeout/abort releases inFlight count", async () => {
  const keys = "key1";
  const poolEntries = buildPool(keys);
  const poolStore = {
    poolOf: async () => poolEntries,
  };

  const resolveConfig = (): WebToolsRuntimeConfig => ({
    enabled: true,
    defaultProvider: "tavily",
    providerAttemptTimeoutMs: 20, // fast timeout
    fallbackOrder: [],
    providerBaseUrls: {},
    enabledProviders: { tavily: true },
  });

  const fakeAdapter = {
    name: "tavily",
    needsBaseUrl: false,
    fetchCapable: true,
    search: async () => ({ sources: [] }),
    fetch: async () => {
      await new Promise((r) => setTimeout(r, 100)); // slow
      return { text: "never" };
    },
  };

  // When Tavily timed out, createFetchProvider fell back to builtin-http which succeeded against the live network (or mock).
  // Provide a failing generic fetcher so we can verify rejection and inFlight release.
  const failingGenericFetcher = async () => {
    throw new Error("Generic fetcher failed");
  };

  const fetchProvider = createFetchProvider(
    resolveConfig,
    async () => keys,
    { tavily: fakeAdapter },
    poolStore as any,
    undefined,
    failingGenericFetcher as any,
  );

  await assert.rejects(async () => fetchProvider.fetch({ url: "https://example.com" }));

  assert.equal(poolEntries[0].inFlight, 0);
});
