/**
 * Route-level smoke test: register the /web-tools/api routes on a mock
 * webServer + deps, then exercise the endpoints exactly as the browser card
 * would (POST /web-tools/api/<method>).
 */
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
function fakeReqRes(method, url, body) {
  const req = {
    url,
    method,
    headers: { host: "127.0.0.1:3080" },
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
    maxResults: 5,
    searchTimeoutMs: 10000,
    fallbackOrder: ["exa"],
    maxFallbackProviders: 2,
    providerBaseUrls: { searxng: "http://127.0.0.1:8080" },
    providerEnabled: {},
  }),
  writeConfig: (patch) => { console.log("  [writeConfig]", JSON.stringify(patch)); },
  readCredential: async (ref) => {
    if (ref === "WEB_TOOLS_TAVILY") return { configured: true, writable: true, value: "k1,k2" };
    if (ref === "WEB_TOOLS_EXA") return { configured: true, writable: true, value: "e1" };
    return { configured: false, writable: true };
  },
  writeCredential: async () => {},
  testProviderSearch: async (provider, query) => ({ ok: true, provider, query, latencyMs: 100, resultCount: 3 }),
  testFullSearch: async (query, provider) => ({ ok: true, backend: provider ?? "tavily", latencyMs: 200, resultCount: 3, attempts: [{ provider: "tavily", outcome: "success", latencyMs: 200 }] }),
  pools: () => ({ tavily: [{ hint: "tvly-XXX…1234", uses: 1, healthy: true }, { hint: "tvly-YYY…5678", uses: 0, healthy: true }] }),
  describeQuotas: async () => ({ tavily: { supported: true, authoritative: true, unit: "credits", remaining: 950, limit: 1000, source: "api", fetchedAt: Date.now() } }),
};

const { server, getHandler } = mockServer();
const dispose = registerRoutes({ webServer: server, webRuntime: { trustedHosts: [] } }, deps);
const handler = getHandler();

async function call(method, payload) {
  const { req, res } = fakeReqRes("POST", `${API_PREFIX}/${method}`, payload);
  await handler(req, res);
  return JSON.parse(res.body);
}

// 1. config/get
const cfg = await call("config/get");
console.log("config/get defaultProvider:", cfg.value.defaultProvider, "| providers:", cfg.value.providers.map((p) => `${p.name}(${p.keyConfigured ? "key" : "nokey"})`).join(", "));
console.log("  tavily pool:", JSON.stringify(cfg.value.providers.find((p) => p.name === "tavily").pool));

// 2. credentials/describe — must NOT leak values
const creds = await call("credentials/describe");
console.log("credentials/describe:", JSON.stringify(creds.value.credentials));
const leaked = JSON.stringify(creds).includes("k1") || JSON.stringify(creds).includes("tvly");
console.log("  leak check (values must be absent):", leaked ? "❌ LEAKED" : "✅ no secrets");

// 3. quota/describe
const quota = await call("quota/describe");
console.log("quota/describe tavily:", JSON.stringify(quota.value.quotas.tavily));

// 4. test/search
const ts = await call("test/search", { query: "DeepSeek Harness" });
console.log("test/search ok:", ts.value.ok, "| backend:", ts.value.backend, "| attempts:", ts.value.attempts?.length);

// 5. config/save round-trip
const save = await call("config/save", { defaultProvider: "exa" });
console.log("config/save:", JSON.stringify(save.value));

// 6. security: non-loopback host must be 403
const { req: req2, res: res2 } = fakeReqRes("POST", `${API_PREFIX}/config/get`, {});
req2.headers.host = "evil.example.com";
await handler(req2, res2);
console.log("non-loopback host → status:", res2.statusCode, "(expect 403)");

dispose();
console.log("✅ route smoke test complete");


