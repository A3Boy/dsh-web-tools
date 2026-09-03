import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateFetchUrl, FetchSecurityError } from "../src/host/fetch-security.ts";

describe("fetch-security: SSRF and URL validation", () => {
  it("allows valid public HTTPS and HTTP URLs", () => {
    const u1 = validateFetchUrl("https://example.com/articles/123?q=test");
    assert.equal(u1.href, "https://example.com/articles/123?q=test");

    const u2 = validateFetchUrl("http://93.184.216.34/index.html");
    assert.equal(u2.href, "http://93.184.216.34/index.html");
  });

  it("blocks non-HTTP protocols", () => {
    const invalidProtocols = [
      "file:///etc/passwd",
      "ftp://ftp.example.com/file.txt",
      "gopher://gopher.example.com",
      "data:text/html,<h1>Hello</h1>",
      "javascript:alert(1)",
      "ws://example.com/socket",
      "wss://example.com/socket",
    ];

    for (const url of invalidProtocols) {
      assert.throws(
        () => validateFetchUrl(url),
        (err: unknown) => {
          assert(err instanceof FetchSecurityError);
          assert.equal(err.code, "WEB_INVALID_URL");
          return true;
        },
        `Expected ${url} to be rejected with WEB_INVALID_URL`,
      );
    }
  });

  it("blocks named local/internal hosts", () => {
    const blockedHosts = [
      "http://localhost/admin",
      "http://localhost:8080/metrics",
      "http://app.localhost/debug",
      "http://server.local/api",
      "http://service.internal/secret",
      "http://router.lan/config",
      "http://myhost.localdomain",
    ];

    for (const url of blockedHosts) {
      assert.throws(
        () => validateFetchUrl(url),
        (err: unknown) => {
          assert(err instanceof FetchSecurityError);
          assert.equal(err.code, "WEB_FETCH_BLOCKED");
          return true;
        },
        `Expected ${url} to be blocked with WEB_FETCH_BLOCKED`,
      );
    }
  });

  it("blocks loopback IPv4 addresses (127.0.0.0/8 and 0.0.0.0)", () => {
    const loopbacks = [
      "http://127.0.0.1:3000",
      "http://127.0.0.2:8080",
      "http://127.255.255.254",
      "http://0.0.0.0:80",
    ];

    for (const url of loopbacks) {
      assert.throws(
        () => validateFetchUrl(url),
        (err: unknown) => {
          assert(err instanceof FetchSecurityError);
          assert.equal(err.code, "WEB_FETCH_BLOCKED");
          return true;
        },
      );
    }
  });

  it("blocks RFC1918 private IPv4 ranges (10.x, 172.16-31.x, 192.168.x)", () => {
    const privates = [
      "http://10.0.0.1/status",
      "http://10.254.1.2:8080",
      "http://172.16.0.1/",
      "http://172.24.10.5/",
      "http://172.31.255.255/",
      "http://192.168.1.1/admin",
      "http://192.168.0.100:5000",
    ];

    for (const url of privates) {
      assert.throws(
        () => validateFetchUrl(url),
        (err: unknown) => {
          assert(err instanceof FetchSecurityError);
          assert.equal(err.code, "WEB_FETCH_BLOCKED");
          return true;
        },
      );
    }
  });

  it("blocks cloud metadata address (169.254.169.254) and link-local ranges", () => {
    const linkLocals = [
      "http://169.254.169.254/latest/meta-data/",
      "http://169.254.1.1/",
    ];

    for (const url of linkLocals) {
      assert.throws(
        () => validateFetchUrl(url),
        (err: unknown) => {
          assert(err instanceof FetchSecurityError);
          assert.equal(err.code, "WEB_FETCH_BLOCKED");
          return true;
        },
      );
    }
  });

  it("blocks loopback and local IPv6 addresses", () => {
    const ipv6Locals = [
      "http://[::1]/debug",
      "http://[::]/admin",
      "http://[fe80::1ff:fe23:4567:890a]/",
      "http://[fc00::1]/",
      "http://[fd12:3456:789a:1::1]/",
      "http://[::ffff:127.0.0.1]/",
    ];

    for (const url of ipv6Locals) {
      assert.throws(
        () => validateFetchUrl(url),
        (err: unknown) => {
          assert(err instanceof FetchSecurityError);
          assert.equal(err.code, "WEB_FETCH_BLOCKED");
          return true;
        },
      );
    }
  });

  it("rejects empty, whitespace, and malformed URLs", () => {
    const malformed = ["", "   ", "not-a-valid-url", "://missing-scheme"];
    for (const url of malformed) {
      assert.throws(
        () => validateFetchUrl(url),
        (err: unknown) => {
          assert(err instanceof FetchSecurityError);
          assert.equal(err.code, "WEB_INVALID_URL");
          return true;
        },
      );
    }
  });
});
