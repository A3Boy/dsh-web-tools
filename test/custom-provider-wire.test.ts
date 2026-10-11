/**
 * dsh-web-tools — Custom Provider & Built-in endpoint wire tests (Issue #9).
 *
 * Verifies that:
 * 1. URL prefix-preserving joinUrl handles path prefixes and slashes correctly.
 * 2. All 8 built-in providers resolve base URL overrides and restore official defaults on reset.
 * 3. Foreign gateway detection accurately flags cross-origin overrides.
 * 4. Tavily Compatible, SearXNG JSON, and Generic JSON protocol codecs encode and parse correctly.
 * 5. Generic JSON mapping errors (missing container, invalid types, empty URLs) are cleanly classified.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  joinUrl,
  endpointViewOf,
  isForeignOverride,
  PROVIDER_ENDPOINTS,
} from "../src/host/endpoints.ts";
import {
  buildCustomRequest,
  mapCustomResponse,
  createCustomAdapter,
  interpolatePlaceholders,
} from "../src/host/providers/custom-compatible.ts";
import type { CustomProviderConfig } from "../src/shared/custom-provider-types.ts";
import type { ProviderError } from "../src/host/providers/types.ts";

test("Wire: joinUrl preserves path prefixes without dropping directory segments", () => {
  // Base with path prefix + relative path
  assert.equal(joinUrl("https://gw.example.com/v2", "search"), "https://gw.example.com/v2/search");
  assert.equal(joinUrl("https://gw.example.com/v2/", "/search"), "https://gw.example.com/v2/search");
  assert.equal(joinUrl("https://gw.example.com/prefix/sub", "/search/query"), "https://gw.example.com/prefix/sub/search/query");

  // Base without path prefix
  assert.equal(joinUrl("https://api.tavily.com", "/search"), "https://api.tavily.com/search");
  assert.equal(joinUrl("https://api.tavily.com/", "search"), "https://api.tavily.com/search");

  // Rejects absolute URLs in relative path
  assert.throws(() => joinUrl("https://api.example.com", "https://evil.com/search"), /must not be an absolute URL/);
  assert.throws(() => joinUrl("https://api.example.com", "//evil.com/search"), /must not be an absolute URL/);
});

test("Wire: all 8 built-in providers resolve overrides and restore official defaults on reset", () => {
  const allProviders = ["tavily", "exa", "firecrawl", "parallel", "brave", "you", "jina", "searxng"];

  for (const name of allProviders) {
    // 1. Untouched state -> resolves to official URL, isOverridden is false
    const defaultView = endpointViewOf(name, undefined);
    assert.ok(defaultView, `Provider ${name} must have endpoint metadata`);
    assert.equal(defaultView.isOverridden, false);
    assert.equal(defaultView.effectiveBaseUrl, defaultView.defaultBaseUrl);
    assert.equal(defaultView.url, PROVIDER_ENDPOINTS[name].search.url);

    // 2. Overridden state with gateway URL -> preserves path and changes destination
    const overrideBase = `https://custom-gateway.corp.internal/${name}`;
    const overriddenView = endpointViewOf(name, { [name]: overrideBase });
    assert.ok(overriddenView);
    assert.equal(overriddenView.isOverridden, true);
    assert.equal(overriddenView.effectiveBaseUrl, overrideBase);
    assert.ok(overriddenView.url.startsWith(overrideBase), `URL "${overriddenView.url}" must start with "${overrideBase}"`);

    // Verify exact path preservation (regression guard for P0-2)
    const expectedPath = PROVIDER_ENDPOINTS[name].search.path;
    const expectedUrl = joinUrl(overrideBase, expectedPath);
    assert.equal(overriddenView.url, expectedUrl, `Provider ${name} must append exact path "${expectedPath}"`);

    // 3. Reset state (empty string) -> restores official endpoint
    const resetView = endpointViewOf(name, { [name]: "" });
    assert.ok(resetView);
    assert.equal(resetView.isOverridden, false);
    assert.equal(resetView.url, PROVIDER_ENDPOINTS[name].search.url);

    // 4. Foreign override detection
    assert.equal(isForeignOverride(name, defaultView.defaultBaseUrl), false);
    assert.equal(isForeignOverride(name, overrideBase), true);
  }
});

test("Wire: Tavily Compatible protocol request building and response mapping", async () => {
  const config: CustomProviderConfig = {
    schemaVersion: 1,
    id: "custom_tavily01",
    name: "Tavily Gateway",
    enabled: true,
    protocol: "tavily-compatible",
    endpoint: {
      baseUrl: "https://gateway.example.com",
      searchPath: "/search",
      method: "POST",
      encoding: "json",
    },
    auth: { mode: "bearer" },
    request: { queryField: "query", limitField: "max_results" },
    response: {
      itemsPath: "results",
      urlPath: "url",
      titlePath: "title",
      snippetPath: "content",
      answerPath: "answer",
    },
    revision: 1,
  };

  const fakeCreds = { read: async () => "secret-token-123" };
  const built = await buildCustomRequest(config, { credentials: fakeCreds, refs: { key: "REF_KEY" } }, "quantum computing", 5);

  assert.equal(built.url, "https://gateway.example.com/search");
  assert.equal(built.method, "POST");
  assert.equal(built.headers["authorization"], "Bearer secret-token-123");
  assert.equal(built.headers["content-type"], "application/json");

  const body = JSON.parse(built.body!);
  assert.equal(body.query, "quantum computing");
  assert.equal(body.max_results, "5");

  // Response mapping
  const sampleResponse = {
    answer: "Quantum computing is computation using quantum states.",
    results: [
      { url: "https://example.com/q1", title: "Intro to Qubits", content: "Qubits exhibit superposition." },
      { url: "https://example.com/q2", title: "Quantum Gates", content: "Logic gates for quantum circuits." },
    ],
  };

  const mapped = mapCustomResponse(config, sampleResponse, 5);
  assert.equal(mapped.content, "Quantum computing is computation using quantum states.");
  assert.equal(mapped.sources.length, 2);
  assert.equal(mapped.sources[0].url, "https://example.com/q1");
  assert.equal(mapped.sources[0].title, "Intro to Qubits");
  assert.equal(mapped.sources[0].snippet, "Qubits exhibit superposition.");
});

test("Wire: SearXNG JSON protocol request building with query parameters and basic auth", async () => {
  const config: CustomProviderConfig = {
    schemaVersion: 1,
    id: "custom_searxng01",
    name: "SearXNG Private",
    enabled: true,
    protocol: "searxng-json",
    endpoint: {
      baseUrl: "https://searxng.corp.internal",
      searchPath: "/search",
      method: "GET",
      encoding: "query",
    },
    auth: { mode: "basic" },
    request: { queryField: "q", staticParams: { format: "json", safesearch: "0" } },
    response: {
      itemsPath: "results",
      urlPath: "url",
      titlePath: "title",
      snippetPath: "content",
    },
    revision: 1,
  };

  const creds = {
    read: async (ref: string) => (ref.endsWith("_USER") ? "alice" : "p@ss:word;with,symbols"),
  };
  const built = await buildCustomRequest(
    config,
    { credentials: creds, refs: { username: "CUSTOM_SEARXNG01_USER", password: "CUSTOM_SEARXNG01_PASS" } },
    "deep learning",
    10,
  );

  const parsedUrl = new URL(built.url);
  assert.equal(parsedUrl.origin, "https://searxng.corp.internal");
  assert.equal(parsedUrl.pathname, "/search");
  assert.equal(parsedUrl.searchParams.get("q"), "deep learning");
  assert.equal(parsedUrl.searchParams.get("format"), "json");
  assert.equal(parsedUrl.searchParams.get("safesearch"), "0");
  assert.equal(built.method, "GET");

  // Basic auth header with special characters preserved
  const expectedAuth = `Basic ${Buffer.from("alice:p@ss:word;with,symbols", "utf8").toString("base64")}`;
  assert.equal(built.headers["authorization"], expectedAuth);
});

test("Wire: Generic JSON protocol maps nested response paths and handles limit", () => {
  const config: CustomProviderConfig = {
    schemaVersion: 1,
    id: "custom_generic01",
    name: "Custom Search API",
    enabled: true,
    protocol: "generic-json",
    endpoint: {
      baseUrl: "https://api.corp.internal/v1",
      searchPath: "/query",
      method: "POST",
      encoding: "json",
    },
    auth: { mode: "api-key-header", headerName: "X-Search-Key" },
    request: { queryField: "keyword", limitField: "count" },
    response: {
      itemsPath: "data.records",
      urlPath: "link",
      titlePath: "meta.headline",
      snippetPath: "meta.summary",
    },
    revision: 1,
  };

  const nestedResponse = {
    data: {
      records: [
        { link: "https://example.com/doc1", meta: { headline: "Doc One", summary: "Summary of doc one" } },
        { link: "https://example.com/doc2", meta: { headline: "Doc Two", summary: "Summary of doc two" } },
        { link: "https://example.com/doc3", meta: { headline: "Doc Three", summary: "Summary of doc three" } },
      ],
    },
  };

  const mapped = mapCustomResponse(config, nestedResponse, 2);
  assert.equal(mapped.sources.length, 2, "maxResults limit must be enforced");
  assert.equal(mapped.sources[0].url, "https://example.com/doc1");
  assert.equal(mapped.sources[0].title, "Doc One");
  assert.equal(mapped.sources[0].snippet, "Summary of doc one");
});

test("Wire: Generic JSON supports nested body template and custom headers with placeholders", async () => {
  const config: CustomProviderConfig = {
    schemaVersion: 1,
    id: "custom_passthrough01",
    name: "Pass-through API",
    enabled: true,
    protocol: "generic-json",
    endpoint: {
      baseUrl: "https://search.example.com/api",
      searchPath: "/query",
      method: "POST",
      encoding: "json",
    },
    auth: { mode: "none" },
    request: {
      headers: {
        "X-API-Key": "{{apiKey}}",
        "X-Custom-Tenant": "research",
      },
      bodyTemplate: {
        search: "{{query}}",
        count: "{{maxResults}}",
        options: {
          mode: "web",
        },
      },
    },
    response: {
      itemsPath: "data.hits",
      urlPath: "link",
      titlePath: "name",
      snippetPath: "description",
    },
    revision: 1,
  };

  const creds = { read: async () => "token-xyz-789" };
  const built = await buildCustomRequest(
    config,
    { credentials: creds, refs: { key: "REF_K" } },
    "quantum teleportation",
    8,
    "token-xyz-789",
  );

  assert.equal(built.url, "https://search.example.com/api/query");
  assert.equal(built.method, "POST");
  assert.equal(built.headers["x-api-key"], "token-xyz-789");
  assert.equal(built.headers["x-custom-tenant"], "research");
  assert.equal(built.headers["content-type"], "application/json");

  const parsedBody = JSON.parse(built.body!);
  assert.equal(parsedBody.search, "quantum teleportation");
  assert.equal(parsedBody.count, 8);
  assert.deepEqual(parsedBody.options, { mode: "web" });
});

test("Wire: response mapping rejects missing or invalid containers", () => {
  const config: CustomProviderConfig = {
    schemaVersion: 1,
    id: "custom_err01",
    name: "Error Test",
    enabled: true,
    protocol: "generic-json",
    endpoint: { baseUrl: "https://api.example.com", searchPath: "/search", method: "GET", encoding: "query" },
    auth: { mode: "none" },
    response: { itemsPath: "data.results", urlPath: "url" },
    revision: 1,
  };

  // Case 1: Missing container path -> invalid-response error
  assert.throws(
    () => mapCustomResponse(config, { status: "ok" }),
    (err: unknown) => {
      const e = err as ProviderError;
      assert.equal(e.code, "invalid-response");
      assert(e.message.includes("data.results"));
      return true;
    },
  );

  // Case 2: Container is not an array -> invalid-response error
  assert.throws(
    () => mapCustomResponse(config, { data: { results: "not an array" } }),
    (err: unknown) => {
      const e = err as ProviderError;
      assert.equal(e.code, "invalid-response");
      assert(e.message.includes("not an array"));
      return true;
    },
  );

  // Case 3: Empty results array -> valid zero results, no error
  const emptyMapped = mapCustomResponse(config, { data: { results: [] } });
  assert.equal(emptyMapped.sources.length, 0);

  // Case 4: Items exist but all missing URL -> invalid-response error with diagnostic
  assert.throws(
    () => mapCustomResponse(config, { data: { results: [{ title: "No url item" }, { name: "Another" }] } }),
    (err: unknown) => {
      const e = err as ProviderError;
      assert.equal(e.code, "invalid-response");
      assert(e.message.includes("none of the 2 item(s)"));
      return true;
    },
  );
});

test("Wire: interpolatePlaceholders performs single-pass replacement preventing secret leak", () => {
  // Query maliciously or coincidentally containing {{apiKey}}
  const maliciousQuery = "Tell me about {{apiKey}} and how it works";
  const template = '{"query": "{{query}}", "auth": "{{apiKey}}", "limit": {{maxResults}}}';
  const secret = "SUPER_SECRET_KEY_123";

  const interpolated = interpolatePlaceholders(template, {
    query: maliciousQuery,
    maxResults: 5,
    apiKey: secret,
  });

  // The query field MUST retain literal {{apiKey}} without having the secret substituted into it
  assert.ok(
    interpolated.includes('"query": "Tell me about {{apiKey}} and how it works"'),
    `Query must not leak secret via recursive placeholder expansion: ${interpolated}`,
  );
  // The auth field MUST have the secret substituted
  assert.ok(
    interpolated.includes('"auth": "SUPER_SECRET_KEY_123"'),
    `Auth field must receive secret: ${interpolated}`,
  );
  // The limit field MUST be substituted
  assert.ok(
    interpolated.includes('"limit": 5'),
    `Limit field must receive number: ${interpolated}`,
  );
});
