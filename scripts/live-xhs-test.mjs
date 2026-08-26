#!/usr/bin/env node
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";
import { XiaohongshuSource } from "../src/host/sources/xiaohongshu.ts";

async function run() {
  const query = process.argv[2] || "Gemini 3.7 实测体验";
  console.log(`[XHS Search Test] Query: "${query}"`);

  const runtime = createNativeBrowserRuntime("auto");
  const xhs = new XiaohongshuSource(runtime);

  const start = Date.now();
  const res = await xhs.search(query, { maxResults: 5 });
  const latency = Date.now() - start;

  console.log(`[Result] Latency: ${latency}ms | Items retrieved: ${res.items.length}`);
  if (res.error) {
    console.error(`[Error] code=${res.error.code}: ${res.error.message}`);
  }

  for (let i = 0; i < res.items.length; i++) {
    const item = res.items[i];
    console.log(`\n--- [${i + 1}] ${item.title} ---`);
    console.log(`Author: ${item.author?.name || "未知"} (${item.author?.url || "无主页"})`);
    console.log(`URL: ${item.url}`);
    console.log(`Likes: ${item.likes ?? "未记录"}`);
    console.log(`Cover: ${item.coverImage || "无"}`);
  }

  await runtime.stop("xiaohongshu");
}

run().catch((err) => {
  console.error("[Fatal]", err);
  process.exit(1);
});
