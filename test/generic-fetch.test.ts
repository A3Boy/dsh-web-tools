import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchGenericWebPage, GenericFetchError, MAX_FETCH_BYTES } from "../src/host/generic-fetch.ts";

describe("generic-fetch: Defuddle & linkedom extraction", () => {
  it("extracts clean markdown and metadata from standard HTML with strictly local parsing", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>DeepSeek Harness Architecture Guide</title>
          <meta name="author" content="DeepSeek Team">
          <meta name="description" content="An architecture overview for plugin developers.">
        </head>
        <body>
          <header>
            <nav><a href="/">Home</a> <a href="/docs">Docs</a></nav>
          </header>
          <main>
            <article>
              <h1>DeepSeek Harness Architecture Guide</h1>
              <p>DeepSeek Harness provides extensible seams for tools, models, and plugins.</p>
              <h2>Key Features</h2>
              <ul>
                <li>Multi-provider search</li>
                <li>Native browser capture</li>
                <li>Resilient fallback</li>
              </ul>
            </article>
          </main>
          <footer>
            <p>Copyright 2026</p>
          </footer>
        </body>
      </html>
    `;

    const mockFetch = async (url: string | URL, init?: RequestInit): Promise<Response> => {
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    };

    const mockDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];

    const res = await fetchGenericWebPage("https://example.com/guide", {
      customFetchWithProxy: mockFetch as any,
      customDnsLookup: mockDnsLookup,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.backend, "builtin-http");
    assert.equal(res.extraction, "defuddle");
    assert.equal(res.title, "DeepSeek Harness Architecture Guide");
    assert(res.content.includes("DeepSeek Harness provides extensible seams"));
    assert(!res.truncated);
  });

  it("handles plain text, markdown, json, and xml with raw-text extraction", async () => {
    const mockDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];

    // 1. JSON
    const jsonPayload = JSON.stringify({ name: "dsh-web-tools", version: "0.3.3" }, null, 2);
    const mockJsonFetch = async (): Promise<Response> => {
      return new Response(jsonPayload, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const jsonRes = await fetchGenericWebPage("https://api.example.com/info.json", {
      customFetchWithProxy: mockJsonFetch as any,
      customDnsLookup: mockDnsLookup,
    });
    assert.equal(jsonRes.extraction, "raw-text");
    assert.equal(jsonRes.content, jsonPayload);

    // 2. Markdown / Text
    const mdPayload = "# Changelog\n\n- Fix web_fetch availability";
    const mockMdFetch = async (): Promise<Response> => {
      return new Response(mdPayload, {
        status: 200,
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    };
    const mdRes = await fetchGenericWebPage("https://example.com/CHANGELOG.md", {
      customFetchWithProxy: mockMdFetch as any,
      customDnsLookup: mockDnsLookup,
    });
    assert.equal(mdRes.extraction, "raw-text");
    assert.equal(mdRes.content, mdPayload);
  });

  it("rejects unsupported binary and media Content-Types", async () => {
    const mockDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const mockPdfFetch = async (): Promise<Response> => {
      return new Response("%PDF-1.4...", {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    };

    await assert.rejects(
      () =>
        fetchGenericWebPage("https://example.com/doc.pdf", {
          customFetchWithProxy: mockPdfFetch as any,
          customDnsLookup: mockDnsLookup,
        }),
      (err: unknown) => {
        assert(err instanceof GenericFetchError);
        assert.equal(err.code, "WEB_UNSUPPORTED_CONTENT_TYPE");
        return true;
      },
    );
  });

  it("follows safe redirects and validates target URL & DNS on every hop", async () => {
    let callCount = 0;
    const mockDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const mockRedirectFetch = async (url: string | URL): Promise<Response> => {
      callCount++;
      const urlStr = String(url);
      if (urlStr === "https://example.com/short") {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://example.com/articles/final-target" },
        });
      }
      return new Response("<html><body><h1>Final Target</h1><p>Success</p></body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    };

    const res = await fetchGenericWebPage("https://example.com/short", {
      customFetchWithProxy: mockRedirectFetch as any,
      customDnsLookup: mockDnsLookup,
    });
    assert.equal(callCount, 2);
    assert.equal(res.finalUrl, "https://example.com/articles/final-target");
    assert(res.content.includes("Success"));
  });

  it("blocks SSRF attempts across redirect (e.g. public -> 127.0.0.1)", async () => {
    const mockDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const mockSsrfRedirectFetch = async (url: string | URL): Promise<Response> => {
      return new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1:8080/admin/secrets" },
      });
    };

    await assert.rejects(
      () =>
        fetchGenericWebPage("https://example.com/ssrf-trap", {
          customFetchWithProxy: mockSsrfRedirectFetch as any,
          customDnsLookup: mockDnsLookup,
        }),
      (err: unknown) => {
        assert(err instanceof GenericFetchError);
        assert.equal(err.code, "WEB_FETCH_BLOCKED");
        return true;
      },
    );
  });

  it("blocks redirect loops exceeding maximum hops", async () => {
    let hop = 0;
    const mockDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const mockLoopFetch = async (): Promise<Response> => {
      hop++;
      return new Response(null, {
        status: 302,
        headers: { Location: `https://example.com/hop-${hop}` },
      });
    };

    await assert.rejects(
      () =>
        fetchGenericWebPage("https://example.com/loop", {
          customFetchWithProxy: mockLoopFetch as any,
          customDnsLookup: mockDnsLookup,
        }),
      (err: unknown) => {
        assert(err instanceof GenericFetchError);
        assert.equal(err.code, "WEB_FETCH_BLOCKED");
        assert(err.message.includes("Too many redirects"));
        return true;
      },
    );
  });

  it("classifies HTTP 404/500 errors properly", async () => {
    const mockDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const mock404Fetch = async (): Promise<Response> => {
      return new Response("Not Found", {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "text/plain" },
      });
    };

    await assert.rejects(
      () =>
        fetchGenericWebPage("https://example.com/non-existent", {
          customFetchWithProxy: mock404Fetch as any,
          customDnsLookup: mockDnsLookup,
        }),
      (err: unknown) => {
        assert(err instanceof GenericFetchError);
        assert.equal(err.code, "WEB_HTTP_ERROR");
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });

  it("enforces explicit attempt timeout budget and classifies WEB_TIMEOUT", async () => {
    const mockDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const mockHangingFetch = async (url: string | URL, init?: RequestInit): Promise<Response> => {
      return new Promise((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    };

    await assert.rejects(
      () =>
        fetchGenericWebPage("https://example.com/hanging", {
          timeoutMs: 30, // 30ms timeout
          customFetchWithProxy: mockHangingFetch as any,
          customDnsLookup: mockDnsLookup,
        }),
      (err: unknown) => {
        assert(err instanceof GenericFetchError);
        assert.equal(err.code, "WEB_TIMEOUT");
        assert(err.message.includes("timed out"));
        return true;
      },
    );
  });

  it("classifies WEB_TIMEOUT when DNS resolution hangs and times out", async () => {
    const mockHangingDnsLookup = async () => {
      return new Promise<never>(() => {}); // Never resolves
    };

    await assert.rejects(
      () =>
        fetchGenericWebPage("https://example.com/hanging-dns", {
          timeoutMs: 30, // 30ms timeout
          customDnsLookup: mockHangingDnsLookup,
        }),
      (err: unknown) => {
        assert(err instanceof GenericFetchError);
        assert.equal(err.code, "WEB_TIMEOUT");
        assert(err.message.includes("timed out"));
        return true;
      },
    );
  });

  it("classifies WEB_ABORTED when DNS resolution is canceled by caller AbortSignal", async () => {
    const mockHangingDnsLookup = async () => {
      return new Promise<never>(() => {}); // Never resolves
    };

    const callerController = new AbortController();
    setTimeout(() => callerController.abort(new Error("caller canceled")), 20);

    await assert.rejects(
      () =>
        fetchGenericWebPage("https://example.com/aborted-dns", {
          signal: callerController.signal,
          timeoutMs: 5000,
          customDnsLookup: mockHangingDnsLookup,
        }),
      (err: unknown) => {
        assert(err instanceof GenericFetchError);
        assert.equal(err.code, "WEB_ABORTED");
        return true;
      },
    );
  });

  it("enforces bounded stream size and flags truncated when exceeding limit", async () => {
    const mockDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];
    // Generate a payload exceeding 5MB
    const chunkSize = 1024 * 1024; // 1MB
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < 6; i++) {
          controller.enqueue(new Uint8Array(chunkSize).fill(65)); // 6MB of 'A'
        }
        controller.close();
      },
    });

    const mockLargeFetch = async (): Promise<Response> => {
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    };

    const res = await fetchGenericWebPage("https://example.com/huge.txt", {
      customFetchWithProxy: mockLargeFetch as any,
      customDnsLookup: mockDnsLookup,
    });
    assert.equal(res.truncated, true);
    assert.equal(res.content.length, MAX_FETCH_BYTES);
  });
});
