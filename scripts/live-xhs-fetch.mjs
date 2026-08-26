#!/usr/bin/env node
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";
import { XiaohongshuSource } from "../src/host/sources/xiaohongshu.ts";

async function run() {
  const url = "https://www.xiaohongshu.com/search_result/6a8a5d90000000001402b3c2?xsec_token=ABZ3Twlkd0qcAiM-UscdYS9cozOGBS66JTFXCuQljVN4E=&xsec_source=";
  console.log(`[XHS Fetch Test] Target: ${url}`);

  const runtime = createNativeBrowserRuntime("auto");
  const xhs = new XiaohongshuSource(runtime);

  const start = Date.now();
  const res = await xhs.fetch(url);
  const latency = Date.now() - start;

  console.log(`[Result] Latency: ${latency}ms`);
  if (res.error) {
    console.error(`[Error] code=${res.error.code}: ${res.error.message}`);
  } else if (res.item) {
    console.log(`Title: ${res.item.title}`);
    console.log(`Author: ${res.item.author?.name || "未知"}`);
    console.log(`Likes: ${res.item.likes}`);
    console.log(`PublishedAt: ${res.item.publishedAt}`);
    console.log(`Text (first 200 chars):\n${(res.item.text || "").slice(0, 200)}...`);
  }

  await runtime.stop("xiaohongshu");
}

run().catch((err) => {
  console.error("[Fatal]", err);
  process.exit(1);
});
