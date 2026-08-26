#!/usr/bin/env node
/**
 * XHS Native Search E2E — uses the REAL production profile & production code path:
 *   SessionManager (NativeBrowserRuntime) → XiaohongshuSource.search()
 * Profile: ~/.dsh/web-tools/browser-profiles/xiaohongshu (same as plugin runtime)
 */
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";
import { XiaohongshuSource } from "../src/host/sources/xiaohongshu.ts";

async function main() {
  const runtime = createNativeBrowserRuntime("chrome");

  console.log("=== 1) Check XHS session metadata ===");
  const st = await runtime.status("xiaohongshu");
  console.log(`runtimeState=${st.runtimeState} authenticated=${st.authenticated} sessionEstablished=${st.sessionEstablished} authState=${st.authState}`);

  if (!st.sessionEstablished) {
    console.log("No saved session — cannot search without login.");
    process.exit(1);
  }

  console.log("\n=== 2) Operation-time auth verify (starts minimized browser if needed) ===");
  const isAuth = await runtime.verifyAuthenticationForOperation("xiaohongshu");
  console.log(`verified=${isAuth}`);
  if (!isAuth) {
    console.log("Session expired — search would fall back to degraded-web.");
    process.exit(2);
  }

  console.log("\n=== 3) Real native search via XiaohongshuSource ===");
  const xhs = new XiaohongshuSource(runtime);
  const outcome = await xhs.search("Gemini 2.5 用户评价", { maxResults: 8 }, undefined);

  if (outcome.error) {
    console.log(`SEARCH ERROR: [${outcome.error.code}] ${outcome.error.message}`);
    process.exit(3);
  }

  console.log(`RETRIEVED ${outcome.items.length} results`);

  const first5 = outcome.items.slice(0, 5);
  for (const it of first5) {
    const url = it.url.length > 100 ? it.url.slice(0, 100) + "…" : it.url;
    console.log(`  - ${it.title} | ${it.author?.name ?? "?"} | ${url}`);
    const hasXsec = it.url.includes("xsec_token=");
    console.log(`    xsec_token=${hasXsec ? "yes" : "NO!"} likes=${it.likes ?? "?"}`);
  }

  console.log("\n=== 4) Cleanup ===");
  await runtime.stop("xiaohongshu");
  console.log("done");
}

main().catch((err) => {
  console.error("E2E FAILED:", err);
  process.exit(1);
});