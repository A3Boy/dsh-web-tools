/**
 * Route-level smoke tests: register the /web-tools/api routes on a mock
 * webServer + deps, then exercise the endpoints exactly as the browser card
 * would. Uses node:test + assert — a failed assertion FAILS the run.
 *
 * Run: node --experimental-strip-types --test test/routes.smoke.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerRoutes, API_PREFIX } from "../src/host/routes.ts";

/** Minimal mock webServer that captures the registered handler. */
function mockServer() {
  let handler;
  const server = {
    register: (route) => {
      handler = route.handler;
      return () => {};
    },
  };
  return { server, getHandler: () => handler };
}

/** Build a fake req/res pair for one POST. */
function fakeReqRes(method, url, body, host = "127.0.0.1:3080", extraHeaders = {}) {
  const req = {
    url,
    method,
    headers: { host, ...extraHeaders },
    async *[Symbol.asyncIterator]() {
      yield JSON.stringify(body ?? {});
    },
  };
  const res = { statusCode: 0, headers: {}, body: "", writeHead(s, h) { this.statusCode = s; this.headers = h; }, end(b) { this.body = String(b ?? ""); } };
  return { req, res };
}

const deps = {
  readConfig: () => ({
    enabled: true,
    defaultProvider: "tavily",
    providerAttemptTimeoutMs: 10000,
    fallbackOrder: ["exa"],
    providerBaseUrls: { searxng: "http://127.0.0.1:8080" },
    providerEnabled: {},
  }),
  writeConfig: async () => {},
  readCredential: async (ref) => {
    if (ref === "WEB_TOOLS_TAVILY") return { configured: true, writable: true, value: "tvly-dev-key-one-1234,tvly-dev-key-two-5678" };
    if (ref === "WEB_TOOLS_EXA") return { configured: true, writable: true, value: "exa-key-0001" };
    return { configured: false, writable: true };
  },
  writeCredential: async () => {},
  testProviderSearch: async (provider, query) => ({ ok: true, provider, query, latencyMs: 100, resultCount: 3 }),
  testFullSearch: async (query, provider) => ({ ok: true, backend: provider ?? "tavily", latencyMs: 200, resultCount: 3, attempts: [{ provider: "tavily", outcome: "success", latencyMs: 200 }] }),
  describeQuotas: async () => ({ tavily: { supported: true, authoritative: true, unit: "credits", remaining: 950, limit: 1000, source: "api", fetchedAt: Date.now() } }),
};

const { server, getHandler } = mockServer();
registerRoutes({ webServer: server, webRuntime: { trustedHosts: [] } }, deps);
const handler = getHandler();

async function call(method, payload, opts = {}) {
  const { req, res } = fakeReqRes("POST", `${API_PREFIX}/${method}`, payload, opts.host, opts.headers);
  await handler(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body || "{}") };
}

test("config/get returns providers with real pool size and no fake health", async () => {
  const { status, body } = await call("config/get");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const cfg = body.value;
  assert.equal(cfg.defaultProvider, "tavily");
  assert.equal(cfg.providerAttemptTimeoutMs, 10000);
  const tavily = cfg.providers.find((p) => p.name === "tavily");
  assert.ok(tavily);
  assert.equal(tavily.poolSize, 2);
  // pool health/uses are runtime Router state — config/get must NOT expose it
  assert.equal("pool" in tavily, false);
});

test("config/get exposes per-key masked hints with stable ids (no secrets)", async () => {
  const { status, body } = await call("config/get");
  assert.equal(status, 200);
  const tavily = body.value.providers.find((p) => p.name === "tavily");
  assert.ok(Array.isArray(tavily.keys), "keys array present");
  assert.equal(tavily.keys.length, 2);
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes("tvly-dev-key-one-1234") && !raw.includes("tvly-dev-key-two-5678"), "full keys leaked in keys[]");
  for (const k of tavily.keys) {
    assert.equal(typeof k.id, "string");
    assert.equal(k.id.length, 8, "key id is an 8-char opaque hash");
    assert.ok(k.hint.includes("…"), "hint is masked");
    assert.equal(typeof k.healthy, "boolean");
  }
  assert.notEqual(tavily.keys[0].id, tavily.keys[1].id, "distinct keys get distinct ids");
});

test("credentials/describe never leaks credential values", async () => {
  const { status, body } = await call("credentials/describe");
  assert.equal(status, 200);
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes("tvly-dev-key-one-1234") && !raw.includes("tvly"), "credential values leaked");
  const tavily = body.value.credentials["WEB_TOOLS_TAVILY"];
  assert.equal(tavily.configured, true);
  assert.equal(tavily.writable, true);
});

test("quota/describe returns the authoritative snapshot", async () => {
  const { status, body } = await call("quota/describe");
  assert.equal(status, 200);
  assert.equal(body.value.quotas.tavily.remaining, 950);
  assert.equal(body.value.quotas.tavily.authoritative, true);
});

test("test/search reports backend and attempts", async () => {
  const { status, body } = await call("test/search", { query: "DeepSeek Harness" });
  assert.equal(status, 200);
  assert.equal(body.value.ok, true);
  assert.equal(body.value.backend, "tavily");
  assert.ok(Array.isArray(body.value.attempts) && body.value.attempts.length > 0);
});

test("config/save persists BEFORE returning saved:true", async () => {
  let persisted = false;
  const saveDeps = {
    ...deps,
    writeConfig: async () => {
      await new Promise((r) => setTimeout(r, 5)); // simulate async persistence
      persisted = true;
    },
  };
  const { server: s2, getHandler: g2 } = mockServer();
  registerRoutes({ webServer: s2, webRuntime: { trustedHosts: [] } }, saveDeps);
  const h2 = g2();
  const { req, res } = fakeReqRes("POST", `${API_PREFIX}/config/save`, { defaultProvider: "exa" });
  await h2(req, res);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(persisted, true, "config/save returned success before persistence finished");
});

// ---- security: configuration plane is loopback + same-origin only ----------

test("non-loopback host is rejected (403) — trustedHosts is NOT auth", async () => {
  const { status } = await call("config/get", {}, { host: "192.168.1.50:3080" });
  assert.equal(status, 403);
});

test("cross-site browser request is rejected (403)", async () => {
  const { status } = await call("config/save", { defaultProvider: "exa" }, { headers: { "sec-fetch-site": "cross-site" } });
  assert.equal(status, 403);
});

test("credentials/set on a LAN host is rejected (403)", async () => {
  const { status } = await call("credentials/set", { provider: "tavily", value: "SECRET" }, { host: "tailnet-name:3080" });
  assert.equal(status, 403);
});

// ---- multi-key pool management (add-key / remove-key) -----------------------

test("credentials/add-key appends one key and persists the joined string", async () => {
  let written;
  const addDeps = {
    ...deps,
    writeCredential: async (ref, value) => { written = value; },
  };
  const { server: s, getHandler: g } = mockServer();
  registerRoutes({ webServer: s, webRuntime: { trustedHosts: [] } }, addDeps);
  const h = g();
  const { req, res } = fakeReqRes("POST", `${API_PREFIX}/credentials/add-key`, { provider: "tavily", value: "tvly-dev-key-three-9999" });
  await h(req, res);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.value.poolSize, 3);
  assert.equal(written, "tvly-dev-key-one-1234,tvly-dev-key-two-5678,tvly-dev-key-three-9999", "storage stays a comma-joined string");
});

test("credentials/add-key rejects duplicates", async () => {
  const { status, body } = await call("credentials/add-key", { provider: "tavily", value: "tvly-dev-key-one-1234" });
  assert.equal(status, 500);
  assert.equal(body.ok, false);
});

test("credentials/remove-key removes by opaque id, not by value", async () => {
  let written;
  const rmDeps = {
    ...deps,
    writeCredential: async (ref, value) => { written = value; },
  };
  const { server: s, getHandler: g } = mockServer();
  registerRoutes({ webServer: s, webRuntime: { trustedHosts: [] } }, rmDeps);
  const h = g();

  // discover the id for the second key via config/get (ids are per-key stable)
  const cfgReq = fakeReqRes("POST", `${API_PREFIX}/config/get`, {});
  await h(cfgReq.req, cfgReq.res);
  const cfg = JSON.parse(cfgReq.res.body).value;
  const tavily = cfg.providers.find((p) => p.name === "tavily");
  const k2id = tavily.keys.find((k) => k.hint.endsWith("5678"))?.id ?? tavily.keys[1].id;

  const { req, res } = fakeReqRes("POST", `${API_PREFIX}/credentials/remove-key`, { provider: "tavily", keyId: k2id });
  await h(req, res);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.value.poolSize, 1);
  assert.equal(written, "tvly-dev-key-one-1234", "remaining key re-joined without the removed one");
});

test("credentials/remove-key with an unknown id fails cleanly", async () => {
  const { status, body } = await call("credentials/remove-key", { provider: "tavily", keyId: "deadbeef" });
  assert.equal(status, 500);
  assert.equal(body.ok, false);
});

test("removing the LAST key writes an empty value (routes hand empty to the writer; the host turns it into unset)", async () => {
  // Live credential store: readCredential reflects prior removals, like the
  // real host (a static mock would re-read the original two-key pool every time).
  let store = "tvly-dev-key-one-1234,tvly-dev-key-two-5678";
  let written;
  const rmDeps = {
    ...deps,
    readCredential: async (ref) => ({ configured: store.length > 0, writable: true, value: store }),
    writeCredential: async (ref, value) => { written = { ref, value }; store = value; },
  };
  const { server: s, getHandler: g } = mockServer();
  registerRoutes({ webServer: s, webRuntime: { trustedHosts: [] } }, rmDeps);
  const h = g();

  // Discover both key ids via config/get.
  const cfgReq = fakeReqRes("POST", `${API_PREFIX}/config/get`, {});
  await h(cfgReq.req, cfgReq.res);
  const cfg = JSON.parse(cfgReq.res.body).value;
  const tavily = cfg.providers.find((p) => p.name === "tavily");
  const ids = tavily.keys.map((k) => k.id);

  for (const keyId of ids) {
    const { req, res } = fakeReqRes("POST", `${API_PREFIX}/credentials/remove-key`, { provider: "tavily", keyId });
    await h(req, res);
    assert.equal(JSON.parse(res.body).ok, true);
  }
  assert.ok(written, "writer called on last removal");
  assert.equal(written.value, "", "last key removal hands an empty value (host unsets)");
  assert.equal(written.ref, "WEB_TOOLS_TAVILY");
});
