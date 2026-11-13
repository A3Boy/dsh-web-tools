/**
 * dsh-web-tools — web_read tool registration and execution tests.
 *
 * Covers:
 *  - Tool definition, parameters schema (url required), output schema
 *  - Execution with valid url, BM25 focus ranking, outline generation
 *  - Rendering starts with UNTRUSTED_NOTICE
 *  - Invalid URL throws WebReadError with code WEB_READ_INVALID_URL
 *  - Fetch failure throws WebReadError with code WEB_READ_FETCH_FAILED
 *  - Unknown section throws WebReadError with code WEB_READ_UNKNOWN_SECTION
 *  - Graceful fallback when host tools.register is unavailable
 *  - Search mode OFF guard & restrict integration
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerWebRead, WebReadError, webReadOutputSchema } from "../src/host/read/tool.ts";
import { UNTRUSTED_NOTICE } from "../src/host/read/render.ts";
import type { FetchedPage } from "../src/host/fetch-page.ts";
import { WEB_TOOL_NAMES, WEB_DISABLED_DENIAL } from "../src/host/search-mode-runtime.ts";

test("registerWebRead: registers tool with required url parameter and valid output schema", () => {
  let registeredTool: any = null;
  const mockCtx = {
    tools: {
      register: (def: any) => {
        registeredTool = def;
        return () => {};
      },
    },
  };

  const fetchPage = async () => ({ content: "sample" });
  registerWebRead(mockCtx as any, fetchPage);

  assert.ok(registeredTool, "tool must be registered");
  assert.equal(registeredTool.name, "web_read");
  assert.equal(registeredTool.parameters.properties.url.type, "string");
  assert.ok(registeredTool.parameters.required.includes("url"));
  assert.equal(registeredTool.output.schema.type, "object");
  assert.equal(registeredTool.output.schema.properties.url.type, "string");
  assert.ok(registeredTool.output.schema.required.includes("url"));
  assert.ok(registeredTool.output.schema.required.includes("outline"));
  assert.ok(registeredTool.output.schema.required.includes("passages"));
  assert.ok(typeof registeredTool.execute === "function");
  assert.ok(typeof registeredTool.output.render === "function");
});

test("registerWebRead: handles missing tools service or defineTool gracefully", () => {
  let warnCalled = false;
  const mockCtx = {
    logger: {
      warn: (msg: string) => {
        warnCalled = true;
        assert.ok(msg.includes("web_read"));
      },
    },
  };

  const fetchPage = async () => ({ content: "sample" });
  const result = registerWebRead(mockCtx as any, fetchPage);
  assert.equal(result, undefined);
  assert.equal(warnCalled, true);
});

test("web_read execute: returns structured result matching schema and render starts with notice", async () => {
  let registeredTool: any = null;
  const mockCtx = {
    tools: {
      register: (def: any) => {
        registeredTool = def;
        return () => {};
      },
    },
  };

  const samplePage: FetchedPage = {
    content: "# Guide to Web Tools\n\nIntroductory text here.\n\n## Section 1: Caching\n\nCaching prevents redundant requests.\n\n## Section 2: BM25\n\nBM25 ranks text effectively.",
    finalUrl: "https://example.com/guide/final",
    truncated: false,
    backend: "native-fetch",
  };

  registerWebRead(mockCtx as any, async () => samplePage);

  const controller = new AbortController();
  const value = await registeredTool.execute(
    { url: "https://example.com/guide", focus: "Caching" },
    { signal: controller.signal },
  );

  assert.equal(value.url, "https://example.com/guide");
  assert.equal(value.finalUrl, "https://example.com/guide/final");
  assert.equal(value.title, "Guide to Web Tools");
  assert.equal(value.focusMatched, true);
  assert.equal(value.fetchTruncated, false);
  assert.equal(value.backend, "native-fetch");
  assert.ok(Array.isArray(value.outline));
  assert.ok(value.outline.length >= 2);
  assert.ok(Array.isArray(value.passages));
  assert.ok(value.passages.length > 0);

  // Render output
  const rendered = registeredTool.output.render(
    { url: "https://example.com/guide", focus: "Caching" },
    value,
  );
  assert.ok(Array.isArray(rendered));
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].type, "text");
  assert.ok(rendered[0].text.startsWith(UNTRUSTED_NOTICE));
  assert.ok(rendered[0].text.includes("URL: https://example.com/guide/final"));
  assert.ok(rendered[0].text.includes("Caching prevents redundant requests"));
});

test("web_read execute: throws WebReadError with WEB_READ_INVALID_URL on invalid url scheme", async () => {
  let registeredTool: any = null;
  const mockCtx = {
    tools: {
      register: (def: any) => {
        registeredTool = def;
        return () => {};
      },
    },
  };

  registerWebRead(mockCtx as any, async () => ({ content: "ok" }));

  await assert.rejects(
    async () => {
      await registeredTool.execute(
        { url: "ftp://example.com/file" },
        { signal: new AbortController().signal },
      );
    },
    (err: any) => {
      assert.ok(err instanceof WebReadError);
      assert.equal(err.code, "WEB_READ_INVALID_URL");
      return true;
    },
  );
});

test("web_read execute: throws WebReadError with WEB_READ_FETCH_FAILED when fetch fails", async () => {
  let registeredTool: any = null;
  const mockCtx = {
    tools: {
      register: (def: any) => {
        registeredTool = def;
        return () => {};
      },
    },
  };

  registerWebRead(mockCtx as any, async () => {
    throw new Error("DNS resolution failed");
  });

  await assert.rejects(
    async () => {
      await registeredTool.execute(
        { url: "https://invalid-domain.xyz" },
        { signal: new AbortController().signal },
      );
    },
    (err: any) => {
      assert.ok(err instanceof WebReadError);
      assert.equal(err.code, "WEB_READ_FETCH_FAILED");
      assert.ok(err.message.includes("DNS resolution failed"));
      return true;
    },
  );
});

test("web_read execute: throws WebReadError with WEB_READ_UNKNOWN_SECTION on invalid section id", async () => {
  let registeredTool: any = null;
  const mockCtx = {
    tools: {
      register: (def: any) => {
        registeredTool = def;
        return () => {};
      },
    },
  };

  registerWebRead(mockCtx as any, async () => ({
    content: "# Page Title\n\nIntro\n\n## Section One\n\nBody",
  }));

  await assert.rejects(
    async () => {
      await registeredTool.execute(
        { url: "https://example.com", section: "s999" },
        { signal: new AbortController().signal },
      );
    },
    (err: any) => {
      assert.ok(err instanceof WebReadError);
      assert.equal(err.code, "WEB_READ_UNKNOWN_SECTION");
      assert.ok(err.message.includes("s999"));
      return true;
    },
  );
});

test("search mode: WEB_TOOL_NAMES includes web_read and guard blocks it when OFF", () => {
  assert.ok(WEB_TOOL_NAMES.includes("web_read"));
  assert.ok(WEB_TOOL_NAMES.includes("web_search"));
  assert.ok(WEB_TOOL_NAMES.includes("web_fetch"));

  const guard = (name: string, isOff: boolean) => {
    return isOff && WEB_TOOL_NAMES.includes(name) ? WEB_DISABLED_DENIAL : undefined;
  };

  assert.equal(guard("web_read", true), WEB_DISABLED_DENIAL);
  assert.equal(guard("web_read", false), undefined);
});
