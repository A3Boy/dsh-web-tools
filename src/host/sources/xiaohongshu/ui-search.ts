import type { CdpPageLease } from "../../browser/types.ts";
import {
  detectXhsPageState,
  waitForStableXhsPageState,
  type XhsPageState,
} from "../../browser/xiaohongshu-page-state.ts";
import {
  extractXhsSearchState,
} from "../browser-scripts/xiaohongshu.ts";

export type XhsSearchNavigationState = XhsPageState | "navigation-failed";

export interface XhsSearchNavigationOutcome {
  state: XhsSearchNavigationState;
  stage: "explore" | "after-submit";
  url: string;
}

/** Enter XHS search through the visible home-page controls, never a direct search URL. */
export async function navigateXhsSearchViaUi(
  page: CdpPageLease,
  query: string,
  signal?: AbortSignal,
  sort?: string,
): Promise<XhsSearchNavigationOutcome> {
  await page.navigate("https://www.xiaohongshu.com/explore", signal);
  await page.waitForLoad(signal);

  const initialState = await waitForStableXhsPageState(page, signal);
  if (initialState !== "ready") {
    return { state: initialState, stage: "explore", url: await page.evaluate<string>("location.href", signal) };
  }

  await page.waitForSelector("#search-input", 8000, signal);
  const focused = await page.focus("#search-input", signal);
  if (!focused) {
    return { state: "navigation-failed", stage: "explore", url: await page.evaluate<string>("location.href", signal) };
  }
  await page.insertText(query, signal);
  const clicked = await page.click(".input-button .search-icon, .input-button", signal);
  if (!clicked) await page.pressKey("Enter", signal);

  const startedAt = Date.now();
  let lastBlockedState: XhsPageState | undefined;
  let blockedRepeats = 0;
  while (Date.now() - startedAt < 12000) {
    if (signal?.aborted) throw new Error("Xiaohongshu UI search aborted");
    const state = await page.call(detectXhsPageState, [], signal);
    const url = await page.evaluate<string>("location.href", signal);
    if (state !== "ready") {
      if (state === lastBlockedState) blockedRepeats++;
      else {
        lastBlockedState = state;
        blockedRepeats = 1;
      }
      if (blockedRepeats >= 3) return { state, stage: "after-submit", url };
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    } else {
      lastBlockedState = undefined;
      blockedRepeats = 0;
    }

    if (url.includes("/search_result")) {
      const structured = await page.call(extractXhsSearchState, [], signal);
      const domCount = await page.evaluate<number>("document.querySelectorAll('section.note-item').length", signal);
      if ((structured.available && structured.feeds.length > 0) || domCount > 0) {
        if (sort && sort !== "general") {
          const sortTagMap: Record<string, string> = {
            time_descending: "最新",
            popularity_descending: "最多点赞",
            comment_descending: "最多评论",
            collect_descending: "最多收藏",
          };
          const targetTag = sortTagMap[sort];
          if (targetTag) {
            await page.evaluate(
              `((tagName) => {
                const panel = document.querySelector(".filter-panel, .filter-container");
                if (!panel) {
                  const filterBtn = document.querySelector(".filter") || document.querySelector(".filter-icon");
                  if (filterBtn) filterBtn.click();
                }
                const allTags = Array.from(document.querySelectorAll(".filter-panel .tags, .filter-container .tags"));
                const target = allTags.find(t => t.textContent.trim() === tagName);
                if (target) target.click();
              })(${JSON.stringify(targetTag)})`,
              signal,
            ).catch(() => {});
          }
        }
        return { state: "ready", stage: "after-submit", url };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    state: "navigation-failed",
    stage: "after-submit",
    url: await page.evaluate<string>("location.href", signal),
  };
}
