#!/usr/bin/env node
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";

async function main() {
  const runtime = createNativeBrowserRuntime("edge");
  const st = await runtime.status("xiaohongshu");
  console.log("status:", JSON.stringify(st, null, 2));

  try {
    const isAuth = await runtime.verifyAuthenticationForOperation("xiaohongshu");
    console.log("verifyAuthenticationForOperation:", isAuth);
  } catch (e) {
    console.error("verify error:", e);
  }
  await runtime.stop("xiaohongshu");
}

main().catch(console.error);