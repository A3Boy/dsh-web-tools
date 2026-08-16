/**
 * fetch-proxy tests: env detection, loopback/NO_PROXY bypass, lazy-undici
 * degradation, and real proxy routing. undici's ProxyAgent tunnels EVERY
 * target (http included) with a CONNECT request, so the test proxy implements
 * CONNECT and forwards the raw stream — proving fetchWithProxy actually
 * routes through the proxy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import { proxyFromEnv, shouldBypassProxy, fetchWithProxy } from "../src/host/fetch-proxy.ts";

test("module loads and degrades to plain fetch when undici is unavailable", async () => {
  // A profile linked before the dependency was declared has no undici. The
  // plugin must still LOAD (lazy import), not crash the whole plugin tree.
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const { execFileSync } = await import("node:child_process");
  // os.tmpdir() works on every platform (process.env.TEMP is Windows-only).
  const tmp = await fs.mkdtemp(os.tmpdir() + "/wt-undici-");
  try {
    await fs.cp("lib", tmp + "/lib", { recursive: true });
    const url = new URL("file:///" + (tmp + "/lib/host/fetch-proxy.js").replace(/\\/g, "/")).href;
    const script = `
      (async () => {
        const fp = await import(${JSON.stringify(url)});
        process.env.HTTPS_PROXY = "http://127.0.0.1:9";
        try {
          await fp.fetchWithProxy("http://127.0.0.1:9/x", { signal: AbortSignal.timeout(2000) });
          process.exit(2); // unexpected: connect to :9 should fail
        } catch (e) {
          // network-level failure, NOT ERR_MODULE_NOT_FOUND
          if (e && e.code === "ERR_MODULE_NOT_FOUND") process.exit(3);
          process.exit(0);
        }
      })();
    `;
    const out = execFileSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 15000 });
    assert.equal(out.trim(), "", "expected graceful degradation");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("proxyFromEnv reads the standard proxy env vars", () => {
  const saved = process.env.HTTPS_PROXY;
  try {
    delete process.env.HTTPS_PROXY;
    process.env.https_proxy = "http://proxy.example:8080";
    assert.equal(proxyFromEnv(), "http://proxy.example:8080");
  } finally {
    if (saved === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = saved;
    delete process.env.https_proxy;
  }
});

test("proxyFromEnv returns undefined when no proxy env var is set", () => {
  const saved = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"].map((k) => [k, process.env[k]]);
  try {
    for (const [k] of saved) delete process.env[k];
    assert.equal(proxyFromEnv(), undefined);
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("shouldBypassProxy: loopback targets never proxy (no NO_PROXY needed)", () => {
  const saved = process.env.NO_PROXY;
  try {
    delete process.env.NO_PROXY;
    assert.equal(shouldBypassProxy("http://127.0.0.1:8080/search?format=json"), true, "127.x loopback must bypass");
    assert.equal(shouldBypassProxy("http://localhost:8765"), true);
    assert.equal(shouldBypassProxy("http://searxng.local/search"), true);
    assert.equal(shouldBypassProxy("http://192.168.1.10:8080"), false, "private LAN is NOT loopback; proxied");
    assert.equal(shouldBypassProxy("http://api.you.com/v1/search"), false, "public API goes through proxy");
  } finally {
    if (saved === undefined) delete process.env.NO_PROXY;
    else process.env.NO_PROXY = saved;
  }
});

test("shouldBypassProxy: NO_PROXY matches exact host, suffix, and <local>", () => {
  const saved = process.env.NO_PROXY;
  try {
    process.env.NO_PROXY = "searxng.internal.example,.corp.example,<local>";
    assert.equal(shouldBypassProxy("http://searxng.internal.example/search"), true);
    assert.equal(shouldBypassProxy("http://anything.corp.example/x"), true);
    assert.equal(shouldBypassProxy("http://api.you.com/v1"), false);
  } finally {
    if (saved === undefined) delete process.env.NO_PROXY;
    else process.env.NO_PROXY = saved;
  }
});

test("fetchWithProxy routes through the proxy via CONNECT tunnel", async () => {
  // Echo server the tunnel terminates at (proxy pipes CONNECT to it).
  const echo = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ path: req.url, via: "echo" }));
  });
  echo.listen(0, "127.0.0.1");
  await once(echo, "listening");
  const echoPort = echo.address().port;

  // CONNECT-capable proxy. undici's ProxyAgent always tunnels (even plain
  // http targets), sending `CONNECT host:port` — which Node's http.Server
  // surfaces through the `connect` event, NOT `request`. We ignore the
  // requested host and pipe to the local echo server, so the test needs no
  // real non-loopback target.
  let tunnels = 0;
  const proxy = createServer((req, res) => {
    res.writeHead(405);
    res.end();
  });
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

  const saved = process.env.HTTPS_PROXY;
  try {
    process.env.HTTPS_PROXY = `http://127.0.0.1:${proxyPort}`;
    // A resolvable, non-loopback host forces proxy use (loopback always
    // bypasses); the proxy ignores the CONNECT target and tunnels to the
    // local echo regardless. (Unresolvable hosts make undici hang in DNS
    // before CONNECT — use a real domain.)
    const res = await fetchWithProxy(`http://example.com/search?q=hello`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.path, "/search?q=hello");
    assert.equal(tunnels, 1, "request must have been tunneled through the proxy");
  } finally {
    if (saved === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = saved;
    proxy.close();
    echo.close();
  }
});
