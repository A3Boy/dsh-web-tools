#!/usr/bin/env node
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";
import { XiaohongshuSource } from "../src/host/sources/xiaohongshu.ts";

async function run() {
  const query = process.argv[2] || "GPT降智 解决";
  console.log("Browser: edge, Query:", query);
  const runtime = createNativeBrowserRuntime("edge");
  const xhs = new XiaohongshuSource(runtime);

  const res = await xhs.search(query, { maxResults: 10 });
  console.log(`Retrieved ${res.items.length} items`);
  if (res.error) console.error("Error:", JSON.stringify(res.error));
  for (let i = 0; i < res.items.length; i++) {
    const item = res.items[i];
    console.log(`[${i + 1}] ${item.title} | ${item.author?.name || "?"} | 赞: ${item.likes ?? 0}`);
    console.log(`    URL: ${item.url}`);
  }
  await runtime.stop("xiaohongshu");
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});