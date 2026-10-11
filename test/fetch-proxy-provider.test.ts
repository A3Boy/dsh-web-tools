/**
 * dsh-web-tools — provider-mode outbound network policy regression tests.
 *
 * Covers the second-review network-layer blockers:
 * 1. Overridden (non-official) endpoints go through the strict provider gate:
 *    exact-endpoint trust, DNS preflight, socket pinning.
 * 2. The pinned dispatcher outlives the response BODY (undici destroy() must
 *    never terminate a mid-read body — delayed chunked JSON is read fully).
 * 3. A configured proxy without an explicit allowProxy authorization for the
 *    target FAILS CLOSED (the proxy's own DNS cannot be substantiated locally).
 * 4. Plaintext http carrying an API key requires an explicit allowHttp grant;
 *    authorized internal HTTP gateways receive the key and work.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import { fetchWithProxy } from "../src/host/fetch-proxy.ts";
import { setGlobalOutboundAuthorizations, TransportError } from "../src/host/provider-transport.ts";

const PROXY_ENV_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy"];

function saveProxyEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const k of PROXY_ENV_KEYS) saved[k] = process.env[k];
  return saved;
}

function restoreProxyEnv(saved: Record<string, string | undefined>) {
  for (const k of PROXY_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

test("provider mode: delayed chunked JSON body is read fully past the pinned dispatcher", async () => {
  let receivedAuth = "";
  const server = createServer((req, res) => {
    receivedAuth = req.headers["authorization"] ?? "";
    res.writeHead(200, { "content-type": "application/json" });
    // One valid JSON document delivered in THREE chunks with real delays,
    // proving undici's response body is still streaming when fetch() resolves.
    res.write(`{"results":[`);
    setTimeout(() => {
      res.write(`{"url":"https://a.example.com","title":"A"},`);
      setTimeout(() => {
        res.write(`{"url":"https://b.example.com","title":"B"}]}`);
        res.end();
      }, 60);
    }, 100);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;

  try {
    setGlobalOutboundAuthorizations([{ host: "127.0.0.1", port, allowPrivate: true, allowHttp: true }]);
    const res = await fetchWithProxy(
      `http://127.0.0.1:${port}/search`,
      { method: "POST", headers: { authorization: "Bearer secret-key", "content-type": "application/json" }, body: "{}" },
      { provider: true },
    );
    // res.json() must succeed with the FULL body — the dispatcher survived the
    // body read (no premature undici destroy() / terminated stream).
    const json = (await res.json()) as { results: Array<{ url: string; title: string }> };
    assert.equal(json.results.length, 2);
    assert.equal(json.results[0].title, "A");
    assert.equal(json.results[1].title, "B");
    assert.equal(receivedAuth, "Bearer secret-key", "authorized gateway must receive the API key");
  } finally {
    setGlobalOutboundAuthorizations([]);
    server.close();
  }
});

test("provider mode: unauthorized override to loopback on a different port is rejected", async () => {
  setGlobalOutboundAuthorizations([]);
  try {
    await assert.rejects(
      () =>
        fetchWithProxy(
          `http://127.0.0.1:${65000}/search`,
          { headers: { authorization: "Bearer secret" } },
          { provider: true },
        ),
      (err: unknown) => {
        assert(err instanceof TransportError);
        assert.equal(err.code, "destination-blocked");
        return true;
      },
      "loopback on a non-official port must not be treated as trusted",
    );
  } finally {
    setGlobalOutboundAuthorizations([]);
  }
});

test("provider mode: proxy configured without allowProxy authorization fails closed", async () => {
  const saved = saveProxyEnv();
  setGlobalOutboundAuthorizations([]);
  let tunneled = 0;
  const proxy = createServer((req, res) => { res.writeHead(405); res.end(); });
  proxy.on("connect", (_req, clientSocket) => {
    tunneled += 1;
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const proxyPort = proxy.address().port;

  try {
    process.env.HTTPS_PROXY = `http://127.0.0.1:${proxyPort}`;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
    // Public literal IP (no DNS network needed), HTTPS so we exercise the proxy
    // decision rather than the plaintext-http gate.
    await assert.rejects(
      () =>
        fetchWithProxy(`https://93.184.216.34:8443/search`, { headers: { authorization: "Bearer secret" } }, { provider: true }),
      (err: unknown) => {
        assert(err instanceof TransportError);
        assert.equal(err.code, "proxy-required");
        return true;
      },
      "proxied egress without an explicit allowProxy authorization must fail closed",
    );
    assert.equal(tunneled, 0, "the request must never reach the proxy when unauthorized");
  } finally {
    restoreProxyEnv(saved);
    setGlobalOutboundAuthorizations([]);
    proxy.close();
  }
});

test("provider mode: authorized target with allowProxy may egress through the proxy", async () => {
  const saved = saveProxyEnv();
  const echo = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ via: "echo", path: req.url }));
  });
  echo.listen(0, "127.0.0.1");
  await once(echo, "listening");
  const echoPort = echo.address().port;

  let tunnels = 0;
  const proxy = createServer((req, res) => { res.writeHead(405); res.end(); });
  proxy.on("connect", (_req, clientSocket, head) => {
    tunnels += 1;
    const upstream = connect(echoPort, "127.0.0.1", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) upstream.write(head);
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });
    clientSocket.on("error", () => upstream.destroy());
    upstream.on("error", () => clientSocket.destroy());
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const proxyPort = proxy.address().port;

  try {
    process.env.HTTPS_PROXY = `http://127.0.0.1:${proxyPort}`;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
    // A public literal host authorized with allowProxy + allowHttp (port matches)
    // → proxied plaintext egress is OK. The test proxy CONNECT-tunnels to the
    // local echo (plain HTTP), so the whole path is exercised without real DNS.
    setGlobalOutboundAuthorizations([{ host: "93.184.216.34", port: 8443, allowProxy: true, allowHttp: true }]);
    const res = await fetchWithProxy(
      `http://93.184.216.34:8443/search?q=x`,
      { headers: { authorization: "Bearer secret" } },
      { provider: true },
    );
    const body = (await res.json()) as { via: string; path: string };
    assert.equal(body.via, "echo", "request must have tunneled through the proxy");
    assert.equal(tunnels, 1);
  } finally {
    restoreProxyEnv(saved);
    setGlobalOutboundAuthorizations([]);
    proxy.close();
    echo.close();
  }
});

test("provider mode: plaintext http carrying a key is refused without allowHttp", async () => {
  setGlobalOutboundAuthorizations([]);
  try {
    await assert.rejects(
      () =>
        fetchWithProxy(`http://93.184.216.34:8080/search`, { headers: { authorization: "Bearer secret" } }, { provider: true }),
      (err: unknown) => {
        assert(err instanceof TransportError);
        assert.equal(err.code, "destination-blocked");
        assert(err.message.includes("plaintext http"));
        return true;
      },
      "unauthorized plaintext http must never receive an API key",
    );
  } finally {
    setGlobalOutboundAuthorizations([]);
  }
});
