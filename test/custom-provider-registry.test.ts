/**
 * dsh-web-tools — Custom Provider dynamic registry and executor integration tests (Issue #9).
 *
 * Verifies that:
 * 1. Snapshot generation is immutable per search operation.
 * 2. Two custom sources sharing a protocol maintain isolated credentials, IDs, and health pools.
 * 3. Keyless custom sources (auth: "none") execute without credentials.
 * 4. Custom sources participate in fallback chains and routing policies.
 * 5. Health cooldown clearing is granular (forgetting one source does not drop another's).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProviderSnapshot,
  policyForCustomSource,
} from "../src/host/custom-provider-registry.ts";
import {
  createSearchProvider,
  createPoolStore,
} from "../src/host/registry.ts";
import { createProviderHealthStore } from "../src/host/provider-health.ts";
import type { CustomProviderConfig } from "../src/shared/custom-provider-types.ts";
import type { TransportRequest, TransportResponse } from "../src/host/provider-transport.ts";

function createMockConfig(id: string, name: string, authMode: "none" | "bearer" = "bearer"): CustomProviderConfig {
  return {
    schemaVersion: 1,
    id,
    name,
    enabled: true,
    protocol: "tavily-compatible",
    endpoint: {
      baseUrl: `https://${id}.example.com`,
      searchPath: "/search",
      method: "POST",
      encoding: "json",
    },
    auth: { mode: authMode },
    revision: 1,
  };
}

test("Registry: buildProviderSnapshot creates an immutable view layering built-ins and custom sources", () => {
  const customAlpha = createMockConfig("custom_alpha", "Alpha Search");
  const customList = [customAlpha];
  const credsStore = new Map<string, string>([["WEB_TOOLS_CUSTOM_ALPHA", "token-alpha"]]);

  const inputs = {
    providerBaseUrls: {},
    customProviders: customList,
    credentials: { read: async (ref: string) => credsStore.get(ref) ?? "" },
    transport: async () => ({} as TransportResponse),
  };

  const snapshot = buildProviderSnapshot(inputs);

  // Contains both built-ins and custom
  assert.ok(snapshot.has("exa"), "Must have built-in exa");
  assert.ok(snapshot.has("tavily"), "Must have built-in tavily");
  assert.ok(snapshot.has("custom_alpha"), "Must have custom_alpha");

  const alpha = snapshot.get("custom_alpha")!;
  assert.equal(alpha.builtIn, false);
  assert.equal(alpha.sourceId, "custom_alpha");
  assert.equal(alpha.refs.key, "WEB_TOOLS_CUSTOM_ALPHA");
  assert.equal(alpha.keyless, false);

  // Immutability: modifying original array does not change the snapshot
  customList.push(createMockConfig("custom_beta", "Beta Search"));
  assert.equal(snapshot.has("custom_beta"), false, "Existing snapshot must not see newly pushed items");
});

test("Registry: two sources sharing a protocol maintain independent credentials and IDs", () => {
  const alpha = createMockConfig("custom_alpha", "Alpha Gateway", "bearer");
  const beta = createMockConfig("custom_beta", "Beta Gateway", "bearer");

  const snapshot = buildProviderSnapshot({
    providerBaseUrls: {},
    customProviders: [alpha, beta],
    credentials: { read: async () => "" },
    transport: async () => ({} as TransportResponse),
  });

  const entryAlpha = snapshot.get("custom_alpha")!;
  const entryBeta = snapshot.get("custom_beta")!;

  assert.equal(entryAlpha.refs.key, "WEB_TOOLS_CUSTOM_ALPHA");
  assert.equal(entryBeta.refs.key, "WEB_TOOLS_CUSTOM_BETA");
  assert.notEqual(entryAlpha.sourceId, entryBeta.sourceId);
  assert.notEqual(entryAlpha.refs.key, entryBeta.refs.key);
});

test("Registry: authMode 'none' is marked keyless", () => {
  const keylessSource = createMockConfig("custom_public", "Public Open Search", "none");

  const snapshot = buildProviderSnapshot({
    providerBaseUrls: {},
    customProviders: [keylessSource],
    credentials: { read: async () => "" },
    transport: async () => ({} as TransportResponse),
  });

  const entry = snapshot.get("custom_public")!;
  assert.equal(entry.keyless, true);
  assert.equal(entry.refs.key, undefined);
});

test("Registry: health store deleteCooldown is granular per source", () => {
  let currentTime = 100000;
  const health = createProviderHealthStore({ now: () => currentTime });

  health.setCooldown("custom_alpha", 200000, "rate-limit");
  health.setCooldown("custom_beta", 200000, "rate-limit");

  assert.equal(health.isCoolingDown("custom_alpha"), true);
  assert.equal(health.isCoolingDown("custom_beta"), true);

  // Clear alpha only
  health.deleteCooldown("custom_alpha");

  assert.equal(health.isCoolingDown("custom_alpha"), false, "Alpha cooldown must be cleared");
  assert.equal(health.isCoolingDown("custom_beta"), true, "Beta cooldown must remain intact");
});

test("Registry: search executor integrates custom provider into fallback chain", async () => {
  const customConfig = createMockConfig("custom_fast", "Fast Search", "none");
  let dialedUrl = "";

  const mockTransport = async (req: TransportRequest): Promise<TransportResponse> => {
    dialedUrl = req.url;
    return {
      status: 200,
      ok: true,
      contentType: "application/json",
      json: {
        results: [{ url: "https://custom.example.com/res1", title: "Custom Hit", content: "Details" }],
      },
      text: "",
      truncated: false,
      headers: new Headers(),
    };
  };

  const snapshot = buildProviderSnapshot({
    providerBaseUrls: {},
    customProviders: [customConfig],
    credentials: { read: async () => "" },
    transport: mockTransport,
  });

  const poolStore = createPoolStore(async () => "");
  const healthStore = createProviderHealthStore();

  const searchProvider = createSearchProvider(
    () => ({
      enabled: true,
      defaultProvider: "custom_fast",
      providerAttemptTimeoutMs: 5000,
      fallbackOrder: ["exa"],
      searchRoutingPolicy: "ordered",
      providerBaseUrls: {},
      enabledProviders: {},
    }),
    async () => "",
    { record: () => {} },
    undefined,
    poolStore,
    healthStore,
    () => snapshot,
  );

  assert.equal(searchProvider.available(), true, "Search provider must be available when custom provider is configured");

  const outcome = await searchProvider.search({ query: "artificial intelligence" });
  assert.equal(outcome.sources.length, 1);
  assert.equal(outcome.sources[0].url, "https://custom.example.com/res1");
  assert.equal(outcome.sources[0].title, "Custom Hit");
  assert.equal(dialedUrl, "https://custom_fast.example.com/search");
});
