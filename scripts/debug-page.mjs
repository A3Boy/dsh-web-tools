#!/usr/bin/env node
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";
import { extractXhsSearchState } from "../src/host/sources/browser-scripts/xiaohongshu.ts";
import { extractVisibleXhsSearch } from "../src/host/sources/browser-scripts/xiaohongshu.ts";

async function main() {
  const runtime = createNativeBrowserRuntime("edge");
  const isAuth = await runtime.verifyAuthenticationForOperation("xiaohongshu");
  console.log("Auth:", isAuth);

  const page = await runtime.openPage("xiaohongshu", "https://www.xiaohongshu.com/search_result?keyword=GPT降智&source=web_search_result_notes");
  await page.waitForLoad();
  await new Promise((r) => setTimeout(r, 3000));

  const title = await page.evaluate("document.title");
  console.log("Title:", title);
  const url = await page.evaluate("window.location.href");
  console.log("URL:", url.slice(0, 150));

  const structured = await page.call(extractXhsSearchState);
  console.log("Structured:", JSON.stringify(structured, null, 2).slice(0, 800));

  const dom = await page.call(extractVisibleXhsSearch);
  console.log("DOM count:", dom.length);

  await page.close();
  await runtime.stop("xiaohongshu");
}

main().catch(console.error);