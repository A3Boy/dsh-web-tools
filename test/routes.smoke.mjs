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
    if (ref === "WEB_TOOLS_TAVILY") return { configured: true, writable: true, value: "k1,k2" };
    if (ref === "WEB_TOOLS_EXA") return { configured: true, writable: true, value: "e1" };
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

test("credentials/describe never leaks credential values", async () => {
  const { status, body } = await call("credentials/describe");
  assert.equal(status, 200);
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes("k1") && !raw.includes("tvly"), "credential values leaked");
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
