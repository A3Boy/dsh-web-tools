#!/usr/bin/env node
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";

async function main() {
  const runtime = createNativeBrowserRuntime("edge");
  await runtime.verifyAuthenticationForOperation("xiaohongshu");

  const page = await runtime.openPage("xiaohongshu", "https://www.xiaohongshu.com/search_result?keyword=Gemini+3.7&source=web_search_result_notes");
  await page.waitForLoad();
  console.log("Waiting 8s...");
  await new Promise((r) => setTimeout(r, 8000));

  const title = await page.evaluate("document.title");
  console.log("Title:", title);

  const feeds = await page.evaluate(`window.__INITIAL_STATE__?.search?.feeds?._value?.length ?? 'no'`);
  console.log("feeds._value.length:", feeds);

  const notes = await page.evaluate("document.querySelectorAll('section.note-item').length");
  console.log("section.note-item:", notes);

  await page.close();
  await runtime.stop("xiaohongshu");
}

main().catch(console.error);