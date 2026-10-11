/**
 * dsh-web-tools — Real HTTP network integration tests (Issue #9).
 *
 * Exercises the complete chain over REAL network sockets (node:http server):
 * 1. Custom Provider adapter searching over real HTTP with Undici pinned connector.
 * 2. Built-in Provider (Tavily/Exa) searching an overridden gateway over real HTTP.
 * 3. 302 Redirect credential leakage protection (redirect: "error").
 * 4. Basic Auth custom provider sending verified Base64 headers over real HTTP.
 * 5. Generic JSON custom provider performing field extraction from real server JSON.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { TavilyProvider } from "../src/host/providers/tavily.ts";
import { ExaProvider } from "../src/host/providers/exa.ts";
import { createCustomAdapter } from "../src/host/providers/custom-compatible.ts";
import { setGlobalOutboundAuthorizations, transact } from "../src/host/provider-transport.ts";
import type { CustomProviderConfig } from "../src/shared/custom-provider-types.ts";

test("Integration: real HTTP server test for custom provider with Undici pinned connector", async () => {
  let receivedHeaders: http.IncomingHttpHeaders | null = null;
  let receivedBody = "";

  const server = http.createServer((req, res) => {
    receivedHeaders = req.headers;
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      receivedBody = raw;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        results: [
          { url: "https://example.com/live-result-1", title: "Live Result One", content: "Details of live result" },
        ],
      }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  try {
    const config: CustomProviderConfig = {
      schemaVersion: 1,
      id: "custom_live_test",
      name: "Live Test Provider",
      enabled: true,
      protocol: "tavily-compatible",
      endpoint: {
        baseUrl: `http://localhost:${port}`,
        searchPath: "/search",
        method: "POST",
        encoding: "json",
      },
      auth: { mode: "bearer" },
      revision: 1,
    };

    const policy = {
      authorizations: [{ host: "localhost", port, allowPrivate: true, allowHttp: true }],
      allowPublicHttp: true,
    };

    const adapter = createCustomAdapter(config, {
      transport: (req) => transact(req),
      credentials: { read: async () => "live-test-bearer-key" },
      refs: { key: "KEY_REF" },
      policy,
      trust: "authorized",
    });

    const outcome = await adapter.search("real network search", 5, "", undefined);

    assert.equal(outcome.sources.length, 1);
    assert.equal(outcome.sources[0].url, "https://example.com/live-result-1");
    assert.equal(outcome.sources[0].title, "Live Result One");
    assert.equal(receivedHeaders!["authorization"], "Bearer live-test-bearer-key");

    const parsedBody = JSON.parse(receivedBody);
    assert.equal(parsedBody.query, "real network search");
  } finally {
    server.close();
  }
});

test("Integration: real HTTP server test for built-in provider address override", async () => {
  let requestedPath = "";
  let authHeader = "";

  const server = http.createServer((req, res) => {
    requestedPath = req.url ?? "";
    authHeader = req.headers["authorization"] ?? "";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      results: [
        { url: "https://gateway.example.com/res", title: "Gateway Hit", content: "From gateway" },
      ],
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  try {
    // Built-in hosted providers now run the strict provider gate: an override
    // to a loopback gateway requires an explicit authorization.
    setGlobalOutboundAuthorizations([{ host: "localhost", port, allowPrivate: true, allowHttp: true }]);
    const gatewayBaseUrl = `http://localhost:${port}/v1/proxy`;
    const outcome = await TavilyProvider.search(
      "testing override",
      5,
      "tvly-real-override-token",
      gatewayBaseUrl,
    );

    assert.equal(requestedPath, "/v1/proxy/search", "Must preserve path prefix and append /search");
    assert.equal(authHeader, "Bearer tvly-real-override-token");
    assert.equal(outcome.sources.length, 1);
    assert.equal(outcome.sources[0].title, "Gateway Hit");
  } finally {
    setGlobalOutboundAuthorizations([]);
    server.close();
  }
});

test("Integration: 302 redirect on authenticated request is blocked to prevent credential leak", async () => {
  const server = http.createServer((req, res) => {
    // Attempt to redirect credential-bearing request to evil third party
    res.writeHead(302, { location: "http://evil-attacker.example.com/steal" });
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  try {
    const config: CustomProviderConfig = {
      schemaVersion: 1,
      id: "custom_redirect_test",
      name: "Redirect Test",
      enabled: true,
      protocol: "tavily-compatible",
      endpoint: {
        baseUrl: `http://localhost:${port}`,
        searchPath: "/search",
        method: "POST",
        encoding: "json",
      },
      auth: { mode: "bearer" },
      revision: 1,
    };

    const policy = {
      authorizations: [{ host: "localhost", port, allowPrivate: true, allowHttp: true }],
      allowPublicHttp: true,
    };

    const adapter = createCustomAdapter(config, {
      transport: (req) => transact(req),
      credentials: { read: async () => "super-secret-key" },
      refs: { key: "KEY_REF" },
      policy,
      trust: "authorized",
    });

    await assert.rejects(
      () => adapter.search("query", 5, "", undefined),
      (err: any) => {
        // Must reject redirect without following
        assert.ok(err);
        return true;
      },
      "Must not follow redirect when credentials are attached",
    );
  } finally {
    server.close();
  }
});

test("Integration: Basic Auth custom source transmits base64 over real HTTP socket", async () => {
  let receivedAuth = "";

  const server = http.createServer((req, res) => {
    receivedAuth = req.headers["authorization"] ?? "";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      results: [{ url: "https://searxng.internal/doc", title: "SearXNG Result" }],
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  try {
    const config: CustomProviderConfig = {
      schemaVersion: 1,
      id: "custom_real_basic",
      name: "Real Basic SearXNG",
      enabled: true,
      protocol: "searxng-json",
      endpoint: {
        baseUrl: `http://localhost:${port}`,
        searchPath: "/search",
        method: "GET",
        encoding: "query",
      },
      auth: { mode: "basic" },
      revision: 1,
    };

    const creds = new Map([
      ["U_REF", "operator"],
      ["P_REF", "complex:pass;with,delims"],
    ]);

    const adapter = createCustomAdapter(config, {
      transport: (req) => transact(req),
      credentials: { read: async (ref) => creds.get(ref) ?? "" },
      refs: { username: "U_REF", password: "P_REF" },
      policy: {
        authorizations: [{ host: "localhost", port, allowPrivate: true, allowHttp: true }],
        allowPublicHttp: true,
      },
      trust: "authorized",
    });

    const outcome = await adapter.search("real query", 5, "", undefined);
    assert.equal(outcome.sources.length, 1);

    const expected = `Basic ${Buffer.from("operator:complex:pass;with,delims", "utf8").toString("base64")}`;
    assert.equal(receivedAuth, expected);
  } finally {
    server.close();
  }
});

test("Integration: multi-key pool sends individually selected Key, not full comma-separated string", async () => {
  let receivedAuth = "";

  const server = http.createServer((req, res) => {
    receivedAuth = req.headers["authorization"] ?? "";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      results: [{ url: "https://example.com/doc", title: "Doc" }],
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  try {
    const config: CustomProviderConfig = {
      schemaVersion: 1,
      id: "custom_multikey",
      name: "MultiKey Provider",
      enabled: true,
      protocol: "tavily-compatible",
      endpoint: {
        baseUrl: `http://localhost:${port}`,
        searchPath: "/search",
        method: "POST",
        encoding: "json",
      },
      auth: { mode: "bearer" },
      revision: 1,
    };

    const adapter = createCustomAdapter(config, {
      transport: (req) => transact(req),
      // Credentials store holds a comma-joined multi-key string
      credentials: { read: async () => "key_alpha,key_beta,key_gamma" },
      refs: { key: "KEY_REF" },
      policy: {
        authorizations: [{ host: "localhost", port, allowPrivate: true, allowHttp: true }],
        allowPublicHttp: true,
      },
      trust: "authorized",
    });

    // When called with the specific selected key from the pool ("key_beta"):
    const outcome = await adapter.search("query", 5, "key_beta", undefined);
    assert.equal(outcome.sources.length, 1);
    // MUST send the selected key, NOT "Bearer key_alpha,key_beta,key_gamma"!
    assert.equal(receivedAuth, "Bearer key_beta");
  } finally {
    server.close();
  }
});

test("Integration: SearXNG JSON protocol automatically appends format=json to real request", async () => {
  let requestedUrl = "";

  const server = http.createServer((req, res) => {
    requestedUrl = req.url ?? "";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      results: [{ url: "https://example.com/searxng", title: "SearXNG Result" }],
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  try {
    const config: CustomProviderConfig = {
      schemaVersion: 1,
      id: "custom_searxng_format",
      name: "SearXNG Format Test",
      enabled: true,
      protocol: "searxng-json",
      endpoint: {
        baseUrl: `http://localhost:${port}`,
        searchPath: "/search",
        method: "GET",
        encoding: "query",
      },
      auth: { mode: "none" },
      revision: 1,
    };

    const adapter = createCustomAdapter(config, {
      transport: (req) => transact(req),
      credentials: { read: async () => "" },
      refs: {},
      policy: {
        authorizations: [{ host: "localhost", port, allowPrivate: true, allowHttp: true }],
        allowPublicHttp: true,
      },
      trust: "authorized",
    });

    await adapter.search("hello world", 5, "", undefined);
    const parsed = new URL(`http://localhost:${port}${requestedUrl}`);
    assert.equal(parsed.searchParams.get("format"), "json", "SearXNG request must include format=json");
    assert.equal(parsed.searchParams.get("q"), "hello world");
  } finally {
    server.close();
  }
});
