import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { McpServer } from "../src/mcp/server.ts";
import { CURRENT_VERSION } from "../src/shared/version.ts";

function createTestHarness(options: {
  mockSearch?: (req: any, signal?: AbortSignal) => Promise<any>;
  mockFetch?: (req: any) => Promise<any>;
  requestTimeoutMs?: number;
} = {}) {
  const inStream = new PassThrough();
  const outStream = new PassThrough();

  const mockSearchProvider = {
    id: "mock-search",
    available: () => true,
    search: options.mockSearch ?? (async (req: any) => ({
      sources: [
        { url: "https://example.com/1", title: "Example 1", snippet: "Snippet 1", publishedAt: "2026-01-01" },
        { url: "https://example.com/2", title: "Example 2", snippet: "Snippet 2" },
      ],
      truncated: false,
    })),
  };

  const mockFetchProvider = {
    id: "mock-fetch",
    available: () => true,
    fetch: options.mockFetch ?? (async (req: any) => ({
      url: req.url,
      statusCode: 200,
      body: { kind: "text" as const, content: "Extracted full page content" },
      metadata: { title: "Page Title", author: "Author Name" },
      truncated: false,
    })),
  };

  const server = new McpServer({
    inStream,
    outStream,
    searchProvider: mockSearchProvider,
    fetchProvider: mockFetchProvider,
    requestTimeoutMs: options.requestTimeoutMs,
  });

  server.start();

  const readResponse = (): Promise<any> => {
    return new Promise((resolve) => {
      let buffer = "";
      const onData = (chunk: Buffer | string) => {
        buffer += chunk.toString();
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          outStream.off("data", onData);
          resolve(JSON.parse(line));
        }
      };
      outStream.on("data", onData);
    });
  };

  const send = (msg: any) => {
    inStream.write(JSON.stringify(msg) + "\n");
  };

  return { server, inStream, outStream, send, readResponse };
}

test("mcp-server: initialize handshake responds with capabilities and serverInfo", async () => {
  const harness = createTestHarness();
  try {
    harness.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    });

    const res = await harness.readResponse();
    assert.equal(res.jsonrpc, "2.0");
    assert.equal(res.id, 1);
    assert.equal(res.result.serverInfo.name, "dsh-web-tools-mcp");
    assert.equal(res.result.serverInfo.version, CURRENT_VERSION);
    assert.deepEqual(res.result.capabilities, { tools: {} });
  } finally {
    harness.server.close();
  }
});

test("mcp-server: unsupported protocol versions fall back to a supported revision", async () => {
  const harness = createTestHarness();
  try {
    harness.send({
      jsonrpc: "2.0",
      id: 11,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });

    const res = await harness.readResponse();
    assert.equal(res.result.protocolVersion, "2025-06-18");
  } finally {
    harness.server.close();
  }
});

test("mcp-server: a supported protocol version is echoed back", async () => {
  const harness = createTestHarness();
  try {
    harness.send({
      jsonrpc: "2.0",
      id: 12,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    });

    const res = await harness.readResponse();
    assert.equal(res.result.protocolVersion, "2024-11-05");
  } finally {
    harness.server.close();
  }
});

test("mcp-server: a stalled backend is cut off by the per-call deadline", async () => {
  const harness = createTestHarness({
    // Deliberately ignores the abort signal — the deadline must still win.
    mockSearch: () => new Promise(() => {}),
    requestTimeoutMs: 25,
  });
  try {
    harness.send({
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: { name: "web_search", arguments: { query: "hang" } },
    });

    const res = await harness.readResponse();
    assert.equal(res.id, 13);
    assert.equal(res.result.isError, true);
    assert.match(res.result.content[0].text, /timed out/i);
  } finally {
    harness.server.close();
  }
});

test("mcp-server: ping responds with empty object", async () => {
  const harness = createTestHarness();
  try {
    harness.send({
      jsonrpc: "2.0",
      id: 2,
      method: "ping",
    });

    const res = await harness.readResponse();
    assert.equal(res.id, 2);
    assert.deepEqual(res.result, {});
  } finally {
    harness.server.close();
  }
});

test("mcp-server: tools/list returns web_search and web_fetch with schemas", async () => {
  const harness = createTestHarness();
  try {
    harness.send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
    });

    const res = await harness.readResponse();
    assert.equal(res.id, 3);
    const tools = res.result.tools;
    assert.equal(tools.length, 2);

    const names = tools.map((t: any) => t.name);
    assert.ok(names.includes("web_search"));
    assert.ok(names.includes("web_fetch"));
  } finally {
    harness.server.close();
  }
});

test("mcp-server: tools/call web_search formats results as Markdown", async () => {
  const harness = createTestHarness();
  try {
    harness.send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "web_search",
        arguments: { query: "deepseek harness" },
      },
    });

    const res = await harness.readResponse();
    assert.equal(res.id, 4);
    assert.ok(!res.result.isError);
    const content = res.result.content[0].text;
    assert.ok(content.includes("[Example 1](https://example.com/1)"));
    assert.ok(content.includes("Snippet 1"));
    assert.ok(content.includes("[Example 2](https://example.com/2)"));
  } finally {
    harness.server.close();
  }
});

test("mcp-server: tools/call web_fetch formats page content and metadata", async () => {
  const harness = createTestHarness();
  try {
    harness.send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "web_fetch",
        arguments: { url: "https://example.com/article" },
      },
    });

    const res = await harness.readResponse();
    assert.equal(res.id, 5);
    assert.ok(!res.result.isError);
    const content = res.result.content[0].text;
    assert.ok(content.includes("# Page Title"));
    assert.ok(content.includes("*Author: Author Name*"));
    assert.ok(content.includes("Extracted full page content"));
  } finally {
    harness.server.close();
  }
});

test("mcp-server: handles unknown methods and malformed json gracefully", async () => {
  const harness = createTestHarness();
  try {
    // Unknown method
    harness.send({
      jsonrpc: "2.0",
      id: 6,
      method: "unknown_rpc_method",
    });

    const res1 = await harness.readResponse();
    assert.equal(res1.id, 6);
    assert.equal(res1.error.code, -32601);

    // Malformed line
    harness.inStream.write("NOT_A_VALID_JSON\n");
    const res2 = await harness.readResponse();
    assert.equal(res2.error.code, -32700);
  } finally {
    harness.server.close();
  }
});
