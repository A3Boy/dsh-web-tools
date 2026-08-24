#!/usr/bin/env node
/**
 * P7.2-B5 E2E probe: execute real Search -> take result URL -> Fetch loop on Windows.
 */
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";
import { XSource } from "../src/host/sources/x.ts";

async function main() {
  console.log("=== P7.2-B5 Live E2E Search -> Fetch Probe ===\n");

  const runtime = createNativeBrowserRuntime("auto");
  const xSource = new XSource(runtime);

  const status = await xSource.status();
  console.log("[1/3] XSource Status:", {
    authenticated: status.authenticated,
    sessionEstablished: status.sessionEstablished,
    runtimeState: status.runtimeState,
  });

  if (!status.sessionEstablished) {
    console.error("X session not established. Aborting.");
    await runtime.dispose();
    process.exit(1);
  }

  // --- Step 2: Execute Real Search ---
  console.log("\n[2/3] Executing XSource.search(\"openai\", { maxResults: 3 }) ...");
  const searchOutcome = await xSource.search("openai", { maxResults: 3 });

  if (searchOutcome.error) {
    console.error("Search failed with error:", searchOutcome.error);
    await runtime.dispose();
    process.exit(1);
  }

  console.log(`✓ Search succeeded with ${searchOutcome.items.length} items (retrievalMode: ${searchOutcome.retrievalMode}):`);
  for (let i = 0; i < searchOutcome.items.length; i++) {
    const item = searchOutcome.items[i];
    console.log(`  [${i + 1}] ID: ${item.id} | Author: ${item.author?.name} (${item.author?.handle})`);
    console.log(`      Title: ${item.title.slice(0, 60)}...`);
    console.log(`      URL: ${item.url}`);
  }

  if (searchOutcome.items.length === 0) {
    console.log("Search returned 0 items. E2E complete.");
    await runtime.dispose();
    return;
  }

  // --- Step 3: Execute Real Fetch on First Result URL ---
  const targetUrl = searchOutcome.items[0].url;
  console.log(`\n[3/3] Executing XSource.fetch("${targetUrl}") ...`);
  const fetchOutcome = await xSource.fetch(targetUrl);

  if (fetchOutcome.error) {
    console.error("Fetch failed with error:", fetchOutcome.error);
    await runtime.dispose();
    process.exit(1);
  }

  const tweet = fetchOutcome.item;
  console.log(`✓ Fetch succeeded (retrievalMode: ${fetchOutcome.retrievalMode}):`);
  console.log(`  ID: ${tweet?.id}`);
  console.log(`  Author: ${tweet?.author?.name} (${tweet?.author?.handle})`);
  console.log(`  PublishedAt: ${tweet?.publishedAt}`);
  console.log(`  Likes: ${tweet?.likes} | Retweets: ${tweet?.retweets} | Replies: ${tweet?.replies}`);
  console.log(`  Images:`, tweet?.images || []);
  console.log(`  Text:\n---\n${tweet?.text}\n---`);

  await runtime.dispose();
  console.log("\n=== Live E2E Search -> Fetch Probe PASSED ===");
}

main().catch((err) => {
  console.error("E2E Probe failed:", err);
  process.exit(1);
});