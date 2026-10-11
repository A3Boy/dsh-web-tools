/**
 * dsh-web-tools — Custom Provider routes, CRUD, and persistence compensation tests (Issue #9).
 *
 * Verifies that:
 * 1. sources/describe lists built-ins and custom sources without leaking secrets.
 * 2. sources/create validates draft, allocates immutable ID, and compensates if credential write fails.
 * 3. sources/update enforces optimistic concurrency revision and bumps revision.
 * 4. sources/delete removes source and its references from routing and revokes credentials.
 * 5. sources/endpoint-set enforces URL validation and foreign-host confirmation.
 * 6. sources/test exercises draft search without mutating runtime health.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerRoutes, API_PREFIX } from "../src/host/routes.ts";
import { SpecializedSourceRegistry } from "../src/host/sources/registry.ts";
import type { RouteDeps } from "../src/host/routes.ts";

function mockServer() {
  let handler: any;
  const server = {
    register: (route: any) => {
      handler = route.handler;
      return () => {};
    },
  };
  return { server, getHandler: () => handler };
}

function fakeReqRes(method: string, url: string, body?: unknown, host = "127.0.0.1:3080") {
  const req = {
    url,
    method,
    headers: { host },
    async *[Symbol.asyncIterator]() {
      yield JSON.stringify(body ?? {});
    },
  };
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(s: number, h: Record<string, string>) {
      this.statusCode = s;
      this.headers = h;
    },
    end(b?: string | Uint8Array) {
      this.body = String(b ?? "");
    },
  };
  return { req, res };
}

test("Routes: sources/describe returns sources metadata without secrets", async () => {
  const { server, getHandler } = mockServer();

  let storedConfig: any = {
    enabled: true,
    defaultProvider: "exa",
    customProviders: [
      {
        schemaVersion: 1,
        id: "custom_mysearch",
        name: "My Internal Search",
        enabled: true,
        protocol: "tavily-compatible",
        endpoint: { baseUrl: "https://mysearch.example.com", searchPath: "/search", method: "POST", encoding: "json" },
        auth: { mode: "bearer" },
        revision: 1,
      },
    ],
  };

  const deps: RouteDeps = {
    readConfig: () => storedConfig,
    writeConfig: async (patch) => { storedConfig = { ...storedConfig, ...patch }; },
    readCredential: async (ref) => ({ configured: ref.toLowerCase().includes("mysearch"), writable: true }),
    writeCredential: async () => {},
    testProviderSearch: async () => ({ ok: true }),
    testFullSearch: async () => ({ ok: true }),
    describeQuotas: async () => ({}),
    nativeRuntime: {} as any,
    sourceRegistry: new SpecializedSourceRegistry(),
  };

  registerRoutes({ webServer: server } as any, deps);
  const handler = getHandler();

  const { req, res } = fakeReqRes("POST", `${API_PREFIX}/sources/describe`);
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.value.builtIns));
  assert.ok(Array.isArray(data.value.custom));

  const custom = data.value.custom.find((c: any) => c.sourceId === "custom_mysearch");
  assert.ok(custom);
  assert.equal(custom.label, "My Internal Search");
  assert.equal(custom.protocol, "tavily-compatible");
  assert.equal(custom.credentials["WEB_TOOLS_CUSTOM_MYSEARCH"].configured, true);
  // Ensure no secret values exist in response
  assert.equal("value" in custom, false);
});

test("Routes: sources/create validates draft, saves config, and compensates on credential failure", async () => {
  const { server, getHandler } = mockServer();

  let storedConfig: any = {
    enabled: true,
    defaultProvider: "exa",
    customProviders: [],
  };

  let credFail = false;
  let revokedId = "";
  const creds = new Map<string, string>();

  const deps: RouteDeps = {
    readConfig: () => storedConfig,
    writeConfig: async (patch) => { storedConfig = { ...storedConfig, ...patch }; },
    readCredential: async (ref) => ({ configured: creds.has(ref), writable: true, value: creds.get(ref) }),
    writeCredential: async (ref, val) => {
      if (credFail) throw new Error("Credentials service unavailable");
      creds.set(ref, val);
    },
    testProviderSearch: async () => ({ ok: true }),
    testFullSearch: async () => ({ ok: true }),
    describeQuotas: async () => ({}),
    nativeRuntime: {} as any,
    sourceRegistry: new SpecializedSourceRegistry(),
    revokeSourceCredentials: async (id) => {
      revokedId = id;
      return { removed: [], failed: [] };
    },
  };

  registerRoutes({ webServer: server } as any, deps);
  const handler = getHandler();

  // 1. Invalid draft rejected
  const invalidDraft = { source: { name: "", endpoint: { baseUrl: "not-a-url" } } };
  const { req: req1, res: res1 } = fakeReqRes("POST", `${API_PREFIX}/sources/create`, invalidDraft);
  await handler(req1, res1);
  assert.equal(res1.statusCode, 400);

  // 2. Successful creation
  const validDraft = {
    source: {
      name: "Team Gateway",
      protocol: "tavily-compatible",
      endpoint: { baseUrl: "https://team.example.com", searchPath: "/search", method: "POST", encoding: "json" },
      auth: { mode: "bearer" },
    },
    credential: { operation: "set", value: "secret-token-abc" },
  };
  const { req: req2, res: res2 } = fakeReqRes("POST", `${API_PREFIX}/sources/create`, validDraft);
  await handler(req2, res2);

  assert.equal(res2.statusCode, 200);
  const createResult = JSON.parse(res2.body).value;
  assert.ok(createResult.id.startsWith("custom_"));
  assert.equal(createResult.saved, true);
  assert.equal(createResult.credentialConfigured, true);
  assert.equal(storedConfig.customProviders.length, 1);

  // 3. Compensation: when credential write fails, config is rolled back
  credFail = true;
  const failingDraft = {
    source: {
      name: "Failing Gateway",
      protocol: "tavily-compatible",
      endpoint: { baseUrl: "https://failing.example.com", searchPath: "/search", method: "POST", encoding: "json" },
      auth: { mode: "bearer" },
    },
    credential: { operation: "set", value: "token" },
  };
  const { req: req3, res: res3 } = fakeReqRes("POST", `${API_PREFIX}/sources/create`, failingDraft);
  await handler(req3, res3);

  assert.equal(res3.statusCode, 400);
  // Stored config must NOT have the failed source
  assert.equal(storedConfig.customProviders.length, 1);
  assert.ok(revokedId.startsWith("custom_"), "Rollback must invoke revokeSourceCredentials");
});

test("Routes: sources/update enforces optimistic concurrency revision", async () => {
  const { server, getHandler } = mockServer();

  let storedConfig: any = {
    customProviders: [
      {
        schemaVersion: 1,
        id: "custom_update01",
        name: "Original Name",
        enabled: true,
        protocol: "generic-json",
        endpoint: { baseUrl: "https://api.example.com", searchPath: "/search", method: "GET", encoding: "query" },
        auth: { mode: "none" },
        revision: 3,
      },
    ],
  };

  const deps: RouteDeps = {
    readConfig: () => storedConfig,
    writeConfig: async (patch) => { storedConfig = { ...storedConfig, ...patch }; },
    readCredential: async () => ({ configured: false, writable: true }),
    writeCredential: async () => {},
    testProviderSearch: async () => ({ ok: true }),
    testFullSearch: async () => ({ ok: true }),
    describeQuotas: async () => ({}),
    nativeRuntime: {} as any,
    sourceRegistry: new SpecializedSourceRegistry(),
  };

  registerRoutes({ webServer: server } as any, deps);
  const handler = getHandler();

  // 1. Conflict on stale revision (expected 2, actual is 3)
  const staleUpdate = {
    id: "custom_update01",
    revision: 2,
    patch: { name: "Stale Edit" },
  };
  const { req: req1, res: res1 } = fakeReqRes("POST", `${API_PREFIX}/sources/update`, staleUpdate);
  await handler(req1, res1);
  assert.equal(res1.statusCode, 409);
  assert.equal(JSON.parse(res1.body).error.code, "conflict");

  // 2. Successful update on matching revision (3 -> 4)
  const matchingUpdate = {
    id: "custom_update01",
    revision: 3,
    patch: { name: "Updated Name" },
  };
  const { req: req2, res: res2 } = fakeReqRes("POST", `${API_PREFIX}/sources/update`, matchingUpdate);
  await handler(req2, res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(storedConfig.customProviders[0].revision, 4);
  assert.equal(storedConfig.customProviders[0].name, "Updated Name");
});

test("Routes: sources/delete removes source, cleans routing references, and revokes credentials", async () => {
  const { server, getHandler } = mockServer();

  let storedConfig: any = {
    defaultProvider: "custom_delete01",
    fallbackOrder: ["exa", "custom_delete01", "tavily"],
    providerEnabled: { custom_delete01: true, exa: true },
    customProviders: [
      {
        schemaVersion: 1,
        id: "custom_delete01",
        name: "Delete Me",
        enabled: true,
        protocol: "tavily-compatible",
        endpoint: { baseUrl: "https://del.example.com", searchPath: "/search", method: "POST", encoding: "json" },
        auth: { mode: "bearer" },
        revision: 1,
      },
    ],
  };

  let revokedId = "";
  const deps: RouteDeps = {
    readConfig: () => storedConfig,
    writeConfig: async (patch) => { storedConfig = { ...storedConfig, ...patch }; },
    readCredential: async () => ({ configured: false, writable: true }),
    writeCredential: async () => {},
    testProviderSearch: async () => ({ ok: true }),
    testFullSearch: async () => ({ ok: true }),
    describeQuotas: async () => ({}),
    nativeRuntime: {} as any,
    sourceRegistry: new SpecializedSourceRegistry(),
    revokeSourceCredentials: async (id) => {
      revokedId = id;
      return { removed: ["WEB_TOOLS_CUSTOM_DELETE01"], failed: [] };
    },
  };

  registerRoutes({ webServer: server } as any, deps);
  const handler = getHandler();

  const { req, res } = fakeReqRes("POST", `${API_PREFIX}/sources/delete`, { id: "custom_delete01" });
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(storedConfig.customProviders.length, 0);
  assert.notEqual(storedConfig.defaultProvider, "custom_delete01");
  assert.deepEqual(storedConfig.fallbackOrder, ["exa", "tavily"]);
  assert.equal("custom_delete01" in storedConfig.providerEnabled, false);
  assert.equal(revokedId, "custom_delete01");
});

test("Routes: sources/endpoint-set validates URLs and manages foreign confirmation", async () => {
  const { server, getHandler } = mockServer();

  let storedConfig: any = {
    providerBaseUrls: {},
  };

  const deps: RouteDeps = {
    readConfig: () => storedConfig,
    writeConfig: async (patch) => { storedConfig = { ...storedConfig, ...patch }; },
    readCredential: async () => ({ configured: false, writable: true }),
    writeCredential: async () => {},
    testProviderSearch: async () => ({ ok: true }),
    testFullSearch: async () => ({ ok: true }),
    describeQuotas: async () => ({}),
    nativeRuntime: {} as any,
    sourceRegistry: new SpecializedSourceRegistry(),
  };

  registerRoutes({ webServer: server } as any, deps);
  const handler = getHandler();

  // 1. Invalid URL rejected
  const { req: req1, res: res1 } = fakeReqRes("POST", `${API_PREFIX}/sources/endpoint-set`, { provider: "exa", baseUrl: "not-a-url" });
  await handler(req1, res1);
  assert.equal(res1.statusCode, 400);

  // 2. Foreign gateway URL without confirmForeign -> 409 conflict
  const { req: req2, res: res2 } = fakeReqRes("POST", `${API_PREFIX}/sources/endpoint-set`, {
    provider: "exa",
    baseUrl: "https://my-gateway.example.com",
  });
  await handler(req2, res2);
  assert.equal(res2.statusCode, 409);
  assert.equal(JSON.parse(res2.body).error.code, "conflict");

  // 3. Foreign gateway URL WITH confirmForeign -> saved
  const { req: req3, res: res3 } = fakeReqRes("POST", `${API_PREFIX}/sources/endpoint-set`, {
    provider: "exa",
    baseUrl: "https://my-gateway.example.com",
    confirmForeign: true,
  });
  await handler(req3, res3);
  assert.equal(res3.statusCode, 200);
  assert.equal(storedConfig.providerBaseUrls.exa, "https://my-gateway.example.com");

  // 4. Empty baseUrl -> deletes override (restores default)
  const { req: req4, res: res4 } = fakeReqRes("POST", `${API_PREFIX}/sources/endpoint-set`, { provider: "exa", baseUrl: "" });
  await handler(req4, res4);
  assert.equal(res4.statusCode, 200);
  assert.equal("exa" in storedConfig.providerBaseUrls, false);
});

test("Routes: routing/set accepts custom source IDs alongside built-in providers", async () => {
  const { server, getHandler } = mockServer();

  let storedConfig: any = {
    searchRoutingPolicy: "ordered",
    defaultProvider: "exa",
    fallbackOrder: [],
    customProviders: [
      {
        schemaVersion: 1,
        id: "custom_mygateway",
        name: "My Gateway",
        enabled: true,
        protocol: "tavily-compatible",
        endpoint: { baseUrl: "https://gw.example.com", searchPath: "/search", method: "POST", encoding: "json" },
        auth: { mode: "bearer" },
        revision: 1,
      },
    ],
  };

  const deps: RouteDeps = {
    readConfig: () => storedConfig,
    writeConfig: async (patch) => { storedConfig = { ...storedConfig, ...patch }; },
    readCredential: async () => ({ configured: false, writable: true }),
    writeCredential: async () => {},
    testProviderSearch: async () => ({ ok: true }),
    testFullSearch: async () => ({ ok: true }),
    describeQuotas: async () => ({}),
    nativeRuntime: {} as any,
    sourceRegistry: new SpecializedSourceRegistry(),
  };

  registerRoutes({ webServer: server } as any, deps);
  const handler = getHandler();

  const { req, res } = fakeReqRes("POST", `${API_PREFIX}/routing/set`, {
    policy: "round-robin",
    orderedProviders: ["custom_mygateway", "exa"],
  });
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.ok, true);
  assert.equal(storedConfig.defaultProvider, "custom_mygateway");
  assert.deepEqual(storedConfig.fallbackOrder, ["exa"]);
  assert.equal(storedConfig.searchRoutingPolicy, "round-robin");
});

test("Routes: sources/test supports candidate credentials and draft testing without mutating runtime", async () => {
  const { server, getHandler } = mockServer();

  let capturedInput: any = null;
  const deps: RouteDeps = {
    readConfig: () => ({ customProviders: [] }),
    writeConfig: async () => {},
    readCredential: async () => ({ configured: false, writable: true }),
    writeCredential: async () => {},
    testProviderSearch: async () => ({ ok: true }),
    testFullSearch: async () => ({ ok: true }),
    describeQuotas: async () => ({}),
    nativeRuntime: {} as any,
    sourceRegistry: new SpecializedSourceRegistry(),
    testSource: async (input) => {
      capturedInput = input;
      return { ok: true, status: "connected", resultCount: 2, latencyMs: 150 };
    },
  };

  registerRoutes({ webServer: server } as any, deps);
  const handler = getHandler();

  const testPayload = {
    draft: {
      name: "Draft Search",
      protocol: "tavily-compatible",
      endpoint: { baseUrl: "https://draft.example.com", searchPath: "/search", method: "POST", encoding: "json" },
      auth: { mode: "bearer" },
    },
    credential: { mode: "candidate", value: "candidate-key-123" },
    query: "test query",
  };

  const { req, res } = fakeReqRes("POST", `${API_PREFIX}/sources/test`, testPayload);
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.ok, true);
  assert.equal(data.value.resultCount, 2);
  assert.equal(capturedInput.credential.value, "candidate-key-123");
  assert.equal(capturedInput.query, "test query");
});
