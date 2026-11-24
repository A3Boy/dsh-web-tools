#!/usr/bin/env node
/**
 * dsh-web-tools MCP server entrypoint.
 *
 * The published package ships `lib/`; a source checkout only has `src/`. Be
 * explicit about which one is missing instead of swallowing the original error
 * and then failing on a `.ts` import (Node cannot execute TypeScript).
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const built = new URL("../lib/mcp/server.js", import.meta.url);

if (!existsSync(fileURLToPath(built))) {
  console.error(
    "[dsh-web-tools-mcp] Missing ../lib/mcp/server.js — run `npm run build` in the dsh-web-tools package first.",
  );
  process.exit(1);
}

const { runMcpServer } = await import(built.href);
await runMcpServer();
