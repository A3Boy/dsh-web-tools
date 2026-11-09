#!/usr/bin/env node
let runMcpServer;
try {
  ({ runMcpServer } = await import("../lib/mcp/server.js"));
} catch {
  ({ runMcpServer } = await import("../src/mcp/server.ts"));
}

runMcpServer();
