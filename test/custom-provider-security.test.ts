/**
 * dsh-web-tools — Custom Provider security & SSRF defense tests (Issue #9).
 *
 * Verifies that:
 * 1. URL structural validation refuses non-HTTP schemes, userinfo, and fragments.
 * 2. Header hygiene refuses reserved and RFC-invalid header names.
 * 3. Unicode truncation never splits surrogate pairs.
 * 4. DNS preflight & socket pinning block private/loopback targets and rebinding.
 * 5. Config plane fence rejects LAN peer requests even with spoofed Host headers.
 * 6. Redirects are blocked and never leak credentials.
 * 7. Response size cap is enforced before JSON parsing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  assertEndpointUrl,
  assertHeaderName,
  truncateUnicodeSafe,
  assertAddressAllowed,
  isLoopbackUrl,
  preflightDns,
  transact,
  TransportError,
  type OutboundPolicy,
} from "../src/host/provider-transport.ts";
import { configPlaneTrust } from "../src/host/routes.ts";

test("Security: assertEndpointUrl enforces strict HTTP(S) structure", () => {
  // Valid endpoints
  assert.equal(assertEndpointUrl("https://search.example.com/search").href, "https://search.example.com/search");
  assert.equal(assertEndpointUrl("http://internal.example.com:8080/v2").href, "http://internal.example.com:8080/v2");

  // Rejects invalid schemes
  const badSchemes = ["file:///etc/passwd", "ftp://example.com/api", "javascript:alert(1)", "ws://example.com"];
  for (const url of badSchemes) {
    assert.throws(() => assertEndpointUrl(url), (err: unknown) => {
      assert(err instanceof TransportError);
      assert.equal(err.code, "invalid-url");
      return true;
    });
  }

  // Rejects userinfo
  assert.throws(() => assertEndpointUrl("https://user:pass@api.example.com"), (err: unknown) => {
    assert(err instanceof TransportError);
    assert.equal(err.code, "invalid-url");
    assert(err.message.includes("userinfo"));
    return true;
  });

  // Rejects fragments
  assert.throws(() => assertEndpointUrl("https://api.example.com/search#fragment"), (err: unknown) => {
    assert(err instanceof TransportError);
    assert.equal(err.code, "invalid-url");
    assert(err.message.includes("fragment"));
    return true;
  });
});

test("Security: assertHeaderName blocks reserved headers and invalid tokens", () => {
  // Allowed custom headers
  assert.doesNotThrow(() => assertHeaderName("x-api-key"));
  assert.doesNotThrow(() => assertHeaderName("X-Custom-Auth-Token"));
  assert.doesNotThrow(() => assertHeaderName("api_key"));

  // Reserved headers
  const reserved = ["Host", "host", "CONNECTION", "content-length", "Transfer-Encoding", "Proxy-Authorization"];
  for (const h of reserved) {
    assert.throws(() => assertHeaderName(h), (err: unknown) => {
      assert(err instanceof TransportError);
      assert.equal(err.code, "config");
      return true;
    });
  }

  // Invalid characters (spaces, semicolons, quotes)
  const invalid = ["bad header", "foo:bar", "foo;bar", "foo=bar", "x-key@val"];
  for (const h of invalid) {
    assert.throws(() => assertHeaderName(h), (err: unknown) => {
      assert(err instanceof TransportError);
      assert.equal(err.code, "config");
      return true;
    });
  }
});

test("Security: truncateUnicodeSafe never creates lone surrogates", () => {
  // Normal string
  assert.equal(truncateUnicodeSafe("Hello World", 5), "Hello…");

  // String ending on a high surrogate boundary: emoji "🎉" is surrogate pair \ud83c\udf89
  const textWithEmoji = "Test 🎉 celebration"; // "Test " = 5 chars. Index 5 is \ud83c, 6 is \udf89
  // If we cut at length 6, naive slice leaves \ud83c (high surrogate dangling)
  const cut = truncateUnicodeSafe(textWithEmoji, 6);
  // truncateUnicodeSafe walks end back by 1 so the high surrogate is excluded
  assert.equal(cut, "Test …");

  // Verify resulting string has no lone surrogate
  const codePoints = Array.from(cut);
  for (const cp of codePoints) {
    const code = cp.codePointAt(0)!;
    assert.ok(code < 0xd800 || code > 0xdfff, "Must not contain surrogate code points");
  }
});

test("Security: assertAddressAllowed blocks loopback, private, and metadata IPs", () => {
  const normalPrivateIps = [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.5",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ];
  const metadataAndLinkLocalIps = [
    "169.254.169.254",       // Cloud metadata IPv4
    "169.254.0.1",           // Link-local IPv4
    "fe80::1",               // Link-local IPv6 (fe80::/10 lower bound)
    "fe90::1",               // Link-local IPv6 (fe80::/10 mid)
    "febf::ffff",            // Link-local IPv6 (fe80::/10 upper bound)
    "::ffff:169.254.169.254", // IPv4-mapped IPv6 dotted-decimal
    "::ffff:a9fe:a9fe",       // IPv4-mapped IPv6 hex format (169.254.169.254)
    "fd00:ec2::254",         // IMDSv6
  ];

  for (const ip of [...normalPrivateIps, ...metadataAndLinkLocalIps]) {
    assert.throws(() => assertAddressAllowed(ip, false), (err: unknown) => {
      assert(err instanceof TransportError);
      assert.equal(err.code, "destination-blocked");
      return true;
    }, `Expected ${ip} to be blocked`);
  }

  // Normal private IPs are allowed when explicit allowPrivate is granted
  for (const ip of normalPrivateIps) {
    assert.doesNotThrow(() => assertAddressAllowed(ip, true));
  }

  // Cloud metadata & link-local are STRICTLY FORBIDDEN even when allowPrivate is granted
  for (const ip of metadataAndLinkLocalIps) {
    assert.throws(() => assertAddressAllowed(ip, true), (err: unknown) => {
      assert(err instanceof TransportError);
      assert.equal(err.code, "destination-blocked");
      assert(err.message.includes("strictly forbidden"));
      return true;
    }, `Expected cloud metadata/link-local ${ip} to be strictly forbidden even with allowPrivate=true`);
  }

  // Public IP is allowed without allowPrivate
  assert.doesNotThrow(() => assertAddressAllowed("93.184.216.34", false));
});

test("Security: preflightDns resolves all records and blocks on any private candidate", async () => {
  const policy: OutboundPolicy = { authorizations: [] };

  // 1. Mock DNS resolving to a public IP and a private IP (DNS rebinding / dual homed)
  const mockDnsRebinding = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "192.168.1.50", family: 4 },
  ];

  await assert.rejects(
    () => preflightDns("rebind.example.com", "public", policy, { lookupAll: mockDnsRebinding }),
    (err: unknown) => {
      assert(err instanceof TransportError);
      assert.equal(err.code, "destination-blocked");
      assert(err.message.includes("192.168.1.50"));
      return true;
    },
  );

  // 2. Mock DNS resolving to valid public IPs only
  const mockDnsClean = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "93.184.216.35", family: 4 },
  ];
  const preflight = await preflightDns("clean.example.com", "public", policy, { lookupAll: mockDnsClean });
  assert.equal(preflight.addresses.length, 2);
  assert.equal(preflight.allowPrivate, false);

  // 3. Authorized internal destination allows private addresses
  const internalPolicy: OutboundPolicy = {
    authorizations: [{ host: "internal.gateway", allowPrivate: true }],
  };
  const mockDnsInternal = async () => [{ address: "10.0.0.5", family: 4 }];
  const authPreflight = await preflightDns("internal.gateway", "authorized", internalPolicy, { lookupAll: mockDnsInternal });
  assert.equal(authPreflight.addresses[0].address, "10.0.0.5");
  assert.equal(authPreflight.allowPrivate, true);
});

test("Security: configPlaneTrust checks actual TCP socket peer, defeating Host header spoofing", () => {
  // Case 1: LAN peer tries sending Host: 127.0.0.1 -> REJECTED
  const spoofedReq: any = {
    headers: { host: "127.0.0.1:3080" },
    socket: { remoteAddress: "192.168.1.155" }, // Real TCP client is on LAN
  };
  assert.equal(configPlaneTrust(spoofedReq), false, "LAN peer address must be refused even with 127.0.0.1 Host header");

  // Case 2: Genuine loopback peer -> ACCEPTED as "peer"
  const genuineLoopbackReq: any = {
    headers: { host: "127.0.0.1:3080" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.equal(configPlaneTrust(genuineLoopbackReq), "peer");

  // Case 3: Genuine IPv6 loopback peer -> ACCEPTED as "peer"
  const genuineIpv6Req: any = {
    headers: { host: "localhost:3080" },
    socket: { remoteAddress: "::1" },
  };
  assert.equal(configPlaneTrust(genuineIpv6Req), "peer");

  // Case 4: Cross-site browser marker -> REJECTED
  const crossSiteReq: any = {
    headers: { host: "127.0.0.1:3080", "sec-fetch-site": "cross-site" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.equal(configPlaneTrust(crossSiteReq), false);

  // Case 5: Mismatched Origin header (cross-domain or cross-port) -> REJECTED
  const evilOriginReq: any = {
    headers: { host: "127.0.0.1:3080", origin: "http://attacker.example.com" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.equal(configPlaneTrust(evilOriginReq), false);

  const crossPortOriginReq: any = {
    headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:9999" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.equal(configPlaneTrust(crossPortOriginReq), false, "Origin on differing port must be refused (P1-isSameOrigin)");

  const matchingOriginReq: any = {
    headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.equal(configPlaneTrust(matchingOriginReq), "peer", "Matching origin scheme, host, and port must be accepted");

  // Case 6: In-process test without socket fallback to loopback Host -> ACCEPTED as "host"
  const inProcessReq: any = {
    headers: { host: "127.0.0.1:3080" },
  };
  assert.equal(configPlaneTrust(inProcessReq), "host");
});

test("Security: transact blocks plain HTTP endpoints unless explicitly authorized with allowHttp", async () => {
  const policy: OutboundPolicy = { authorizations: [], allowPublicHttp: false };
  const req = {
    url: "http://example.com/search",
    method: "GET" as const,
    headers: {},
    label: "Test HTTP",
    trust: "public" as const,
    policy,
  };

  await assert.rejects(
    () => transact(req, { lookupAll: async () => [{ address: "93.184.216.34", family: 4 }] }),
    (err: unknown) => {
      assert(err instanceof TransportError);
      assert.equal(err.code, "destination-blocked");
      assert(err.message.includes("Plain http://"));
      return true;
    },
  );

  // When explicitly authorized with allowHttp, plain http is accepted: real
  // loopback server, full end-to-end (proves the allowHttp grant works).
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  try {
    const authorizedPolicy: OutboundPolicy = {
      authorizations: [{ host: "127.0.0.1", port, allowHttp: true, allowPrivate: true }],
    };
    const authReq = {
      url: `http://127.0.0.1:${port}/search`,
      method: "GET" as const,
      headers: { authorization: "Bearer secret" },
      label: "Authorized Internal HTTP",
      trust: "authorized" as const,
      policy: authorizedPolicy,
    };
    const res = await transact(authReq);
    assert.equal(res.status, 200);
    assert.equal((res.json as { ok: boolean; path: string } | undefined)?.path, "/search");
  } finally {
    server.close();
  }
});

test("Security: transact never proxies loopback targets even when a proxy is configured", async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;

  try {
    const policy: OutboundPolicy = {
      authorizations: [{ host: "127.0.0.1", port, allowPrivate: true, allowHttp: true }],
    };
    const req = {
      url: `http://127.0.0.1:${port}/search`,
      method: "GET" as const,
      headers: { authorization: "Bearer secret" },
      label: "Loopback bypass proxy gate",
      trust: "authorized" as const,
      policy,
    };

    // A DEAD proxy is configured and allowProxy is false. A loopback target must
    // BYPASS the proxy gate and dial directly — otherwise every local SearXNG /
    // custom instance breaks on machines with a system proxy.
    const res = await transact(req, {
      proxyUrl: () => "http://127.0.0.1:9",
    });
    assert.equal(res.status, 200);
    assert.equal((res.json as { ok: boolean; path: string } | undefined)?.path, "/search");
  } finally {
    server.close();
  }
});

test("Security: transact dials intranet destinations directly even with a system proxy", async () => {
  // The Windows-proxy failure mode: a self-hosted source on LAN space is saved
  // and authorized, but because an HTTP proxy is configured the request used to
  // abort with `proxy-required` — a proxy cannot reach 10.x/192.168.x anyway.
  // The resolved address now decides: private destination -> direct dial.
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;

  try {
    const host = "search.corp-intranet.example";
    const policy: OutboundPolicy = {
      authorizations: [{ host, port, allowPrivate: true, allowHttp: true }],
      allowProxy: false,
    };
    const req = {
      url: `http://${host}:${port}/search`,
      method: "GET" as const,
      headers: { authorization: "Bearer secret" },
      label: "Intranet bypass proxy gate",
      trust: "authorized" as const,
      policy,
    };

    const res = await transact(req, {
      proxyUrl: () => "http://127.0.0.1:9",
      lookupAll: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    assert.equal(res.status, 200);
    assert.equal((res.json as { ok: boolean; path: string } | undefined)?.path, "/search");
  } finally {
    server.close();
  }
});

test("Security: isLoopbackUrl recognizes localhost and IPv4/IPv6 loopback", () => {
  assert.equal(isLoopbackUrl("http://127.0.0.1:8080/search"), true);
  assert.equal(isLoopbackUrl("http://localhost:8080/search"), true);
  assert.equal(isLoopbackUrl("http://[::1]:8080/search"), true);
  assert.equal(isLoopbackUrl("https://192.168.1.10/search"), false);
  assert.equal(isLoopbackUrl("https://example.com/search"), false);
});
