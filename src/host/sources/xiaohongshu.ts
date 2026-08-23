import { createNativeBrowserRuntime, type NativeBrowserRuntime } from "../browser/index.ts";
import {
  extractVisibleXhsSearch,
  extractXhsNoteDetail,
  type XhsNoteExtraction,
} from "./browser-scripts/xiaohongshu.ts";
import type {
  SpecializedSource,
  SourceStatus,
  SourceSearchRequest,
  SourceSearchOutcome,
  SourceFetchOutcome,
  SourceItem,
} from "./types.ts";

export class XiaohongshuSource implements SpecializedSource {
  readonly id = "xiaohongshu" as const;
  readonly name = "小红书";
  private runtime: NativeBrowserRuntime;

  constructor(runtime?: NativeBrowserRuntime) {
    this.runtime = runtime || createNativeBrowserRuntime();
  }

  async status(): Promise<SourceStatus> {
    const sessionStatus = await this.runtime.status("xiaohongshu");
    return {
      id: "xiaohongshu",
      name: "小红书",
      enabled: true,
      runtimeAvailable: sessionStatus.runtimeAvailable,
      runtimeState: sessionStatus.runtimeState,
      authenticated: sessionStatus.authenticated,
      account: sessionStatus.accountLabel
        ? { handle: sessionStatus.accountLabel, name: sessionStatus.accountLabel }
        : undefined,
      lastError: sessionStatus.lastError,
      lastCheckedAt: sessionStatus.verifiedAt || Date.now(),
    };
  }

  async search(
    query: string,
    req?: SourceSearchRequest,
    signal?: AbortSignal,
  ): Promise<SourceSearchOutcome> {
    const status = await this.runtime.status("xiaohongshu");
    if (!status.authenticated) {
      return {
        items: [],
        error: { code: "auth-required", message: "Xiaohongshu session is not authenticated", retryable: false },
      };
    }

    const maxResults = Math.min(req?.maxResults || 10, 30);
    const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_search_result_notes`;

    let page;
    try {
      page = await this.runtime.openPage("xiaohongshu", searchUrl, signal);
    } catch (err: any) {
      if (err.name === "UrlDisallowedError") {
        return { items: [], error: { code: "blocked", message: err.message, retryable: false } };
      }
      return { items: [], error: { code: "runtime-unavailable", message: err.message, retryable: true } };
    }

    try {
      await page.waitForLoad(signal);
      // Wait for note container
      try {
        await page.waitForSelector("section.note-item", 8000, signal);
      } catch {
        // May be empty result
      }

      const collectedMap = new Map<string, SourceItem>();
      let noNewCount = 0;
      const maxScrolls = 6;

      for (let s = 0; s < maxScrolls; s++) {
        if (signal?.aborted) break;

        const batch: XhsNoteExtraction[] = await page.call(extractVisibleXhsSearch, [], signal);
        let addedThisBatch = 0;

        for (const item of batch) {
          if (!collectedMap.has(item.id)) {
            collectedMap.set(item.id, {
              id: item.id,
              title: item.title,
              url: item.url,
              snippet: item.snippet,
              author: item.authorName ? { name: item.authorName, url: item.authorUrl } : undefined,
              likes: item.likes,
              coverImage: item.coverImage,
              platform: "xiaohongshu",
            });
            addedThisBatch++;
          }
        }

        if (collectedMap.size >= maxResults) break;

        if (addedThisBatch === 0) {
          noNewCount++;
          if (noNewCount >= 2) break;
        } else {
          noNewCount = 0;
        }

        await page.scrollBy(700, signal);
      }

      const items = Array.from(collectedMap.values()).slice(0, maxResults);
      return { items };
    } catch (err: any) {
      return { items: [], error: { code: "parse-failed", message: err.message, retryable: true } };
    } finally {
      await page.close();
    }
  }

  async fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome> {
    const status = await this.runtime.status("xiaohongshu");
    if (!status.authenticated) {
      return { error: { code: "auth-required", message: "Xiaohongshu session is not authenticated", retryable: false } };
    }

    let page;
    try {
      page = await this.runtime.openPage("xiaohongshu", url, signal);
    } catch (err: any) {
      return { error: { code: "runtime-unavailable", message: err.message, retryable: true } };
    }

    try {
      await page.waitForLoad(signal);
      await page.waitForSelector("#detail-title, .title, .security-verify", 8000, signal);

      const detail = await page.call(extractXhsNoteDetail, [], signal);
      if (detail.isBlocked) {
        return { error: { code: "blocked", message: "Xiaohongshu CAPTCHA verification required", retryable: false } };
      }

      return {
        item: {
          id: url,
          title: detail.title || "小红书笔记",
          url,
          text: detail.text,
          author: detail.authorName ? { name: detail.authorName, url: detail.authorUrl } : undefined,
          publishedAt: detail.publishedAt,
          likes: detail.likes,
          platform: "xiaohongshu",
        },
      };
    } catch (err: any) {
      return { error: { code: "parse-failed", message: err.message, retryable: true } };
    } finally {
      await page.close();
    }
  }
}
