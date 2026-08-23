/**
 * Build script for MV3 Browser Bridge extension.
 */
import { build } from "tsdown";
import { resolve } from "node:path";
import { cpSync, mkdirSync, existsSync } from "node:crypto";

async function buildBridge() {
  await build({
    entry: ["src/service-worker.ts"],
    outDir: "dist",
    format: "esm",
    target: "es2022",
    clean: true,
    platform: "browser",
  });
}

buildBridge().catch((err) => {
  console.error("Bridge build failed:", err);
  process.exit(1);
});
