import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFetchProvider, createPoolStore, type WebToolsRuntimeConfig } from "../src/host/registry.ts";
import type { ProviderAdapterLike } from "../src/host/registry.ts";
import type { GenericFetchResult } from "../src/host/generic-fetch.ts";

function stubConfig(overrides: Partial<WebToolsRuntimeConfig> = {}): WebToolsRuntimeConfig {
  return {
    enabled: true,
    defaultProvider: "searxng",
    providerAttemptTimeoutMs: 5000,
    fallbackOrder: ["searxng", "brave", "tavily"],
    providerBaseUrls: {},
    enabledProviders: { searxng: true, brave: true, tavily: true },
    ...overrides,
  };
}

describe("fetch fallback routing: Native -> Generic fallback", () => {
  it("reports available = true for SearXNG-only or Brave-only setups (Issue #5 fix)", () => {
    const searxngConfig = stubConfig({ defaultProvider: "searxng", fallbackOrder: ["searxng"] });
    const fetchProvider = createFetchProvider(() => searxngConfig, async () => "");
    assert.equal(fetchProvider.available(), true);

    const braveConfig = stubConfig({ defaultProvider: "brave", fallbackOrder: ["brave"] });
    const braveFetchProvider = createFetchProvider(() => braveConfig, async () => "");
    assert.equal(braveFetchProvider.available(), true);
  });

  it("reports available = false when plugin is disabled in config", () => {
    const disabledConfig = stubConfig({ enabled: false });
    const fetchProvider = createFetchProvider(() => disabledConfig, async () => "");
    assert.equal(fetchProvider.available(), false);
  });

  it("uses native fetch provider (e.g. Tavily/Exa) directly when available and healthy", async () => {
    let nativeCalled = false;
    let genericCalled = false;

    const mockAdapters: Record<string, ProviderAdapterLike> = {
      tavily: {
        name: "tavily",
        needsBaseUrl: false,
        fetchCapable: true,
        async search() { return { sources: [] }; },
        async fetch(url: string) {
          nativeCalled = true;
          return { text: "Extracted by Tavily native API" };
        },
      },
    };

    const config = stubConfig({
      defaultProvider: "tavily",
      fallbackOrder: ["tavily"],
    });

    const mockGeneric = async (): Promise<GenericFetchResult> => {
      genericCalled = true;
      return {
        url: "https://example.com",
        finalUrl: "https://example.com",
        statusCode: 200,
        contentType: "text/html",
        content: "Built-in content",
        truncated: false,
        backend: "builtin-http",
        extraction: "defuddle",
      };
    };

    const fetchProvider = createFetchProvider(
      () => config,
      async () => "tavily-key-1",
      mockAdapters,
      undefined,
      undefined,
      mockGeneric,
    );

    const res = await fetchProvider.fetch({ url: "https://example.com/article" });
    assert.equal(nativeCalled, true);
    assert.equal(genericCalled, false);
    assert.equal(res.body.content, "Extracted by Tavily native API");
    assert.equal(res.backend, "tavily");
  });

  it("falls back to generic fetch when default search provider is non-fetch-capable (SearXNG / Brave)", async () => {
    let genericCalled = false;

    const mockAdapters: Record<string, ProviderAdapterLike> = {
      searxng: {
        name: "searxng",
        needsBaseUrl: true,
        fetchCapable: false,
        async search() { return { sources: [] }; },
        async fetch() { throw new Error("not implemented"); },
      },
    };

    const config = stubConfig({
      defaultProvider: "searxng",
      fallbackOrder: ["searxng"],
    });

    const mockGeneric = async (url: string): Promise<GenericFetchResult> => {
      genericCalled = true;
      return {
        url,
        finalUrl: url,
        statusCode: 200,
        contentType: "text/html",
        title: "SearXNG Fallback Article",
        author: "OpenSource Dev",
        publishedAt: "2026-04-12",
        content: "Extracted via builtin Defuddle",
        truncated: false,
        backend: "builtin-http",
        extraction: "defuddle",
      };
    };

    const fetchProvider = createFetchProvider(
      () => config,
      async () => "",
      mockAdapters,
      undefined,
      undefined,
      mockGeneric,
    );

    const res = await fetchProvider.fetch({ url: "https://example.com/docs" });
    assert.equal(genericCalled, true);
    assert.equal(res.backend, "builtin-http");
    assert.equal(res.body.content, "Extracted via builtin Defuddle");
    assert.equal(res.metadata?.title, "SearXNG Fallback Article");
    assert.equal(res.metadata?.author, "OpenSource Dev");
  });

  it("falls back to generic fetch when native fetch provider fails with retryable error (e.g. 500 / network)", async () => {
    let genericCalled = false;

    const mockAdapters: Record<string, ProviderAdapterLike> = {
      exa: {
        name: "exa",
        needsBaseUrl: false,
        fetchCapable: true,
        async search() { return { sources: [] }; },
        async fetch() {
          const err: any = new Error("Exa server 500");
          err.code = "server";
          throw err;
        },
      },
    };

    const config = stubConfig({
      defaultProvider: "exa",
      fallbackOrder: ["exa"],
    });

    const mockGeneric = async (url: string): Promise<GenericFetchResult> => {
      genericCalled = true;
      return {
        url,
        finalUrl: url,
        statusCode: 200,
        contentType: "text/html",
        content: "Fallback content after Exa failure",
        truncated: false,
        backend: "builtin-http",
        extraction: "defuddle",
      };
    };

    const fetchProvider = createFetchProvider(
      () => config,
      async () => "exa-key",
      mockAdapters,
      undefined,
      undefined,
      mockGeneric,
    );

    const res = await fetchProvider.fetch({ url: "https://example.com/failed-native" });
    assert.equal(genericCalled, true);
    assert.equal(res.backend, "builtin-http");
    assert.equal(res.body.content, "Fallback content after Exa failure");
  });
});
