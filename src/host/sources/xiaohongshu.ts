import { createNativeBrowserRuntime, type NativeBrowserRuntime } from "../browser/index.ts";
import {
  extractXhsSearchState,
  extractVisibleXhsSearch,
  extractXhsDetailState,
  extractXhsNoteDetail,
  type XhsNoteExtraction,
} from "./browser-scripts/xiaohongshu.ts";
import { normalizeXhsFeed } from "./xiaohongshu/normalize.ts";
import { buildXhsSearchUrl } from "./xiaohongshu/query.ts";
import type {
  SpecializedSource,
  SourceStatus,
  SourceSearchRequest,
  SourceSearchOutcome,
  SourceFetchOutcome,
  SourceItem,
} from "./types.ts";

// XHS Native Search is experimental and disabled by default in production.
// XHS search is environment-sensitive (account/session/IP/browser/risk-control).
// Enable only for debugging: XHS_NATIVE_SEARCH=1
// The production path uses general-web fallback (site:xiaohongshu.com).
let xhsNativeSearchEnabled = (process.env.XHS_NATIVE_SEARCH ?? "0") === "1";
export function setXhsNativeSearchEnabled(v: boolean) { xhsNativeSearchEnabled = v; }
export function isXhsNativeSearchEnabled() { return xhsNativeSearchEnabled; }

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
      sessionEstablished: sessionStatus.sessionEstablished,
      capabilities: {
        nativeSearch: isXhsNativeSearchEnabled(),  // experimental — disabled by default
        nativeFetch: true,                          // XHS detail fetch using headless native browser
        webSearchFallback: true,                    // general web discovery via site:xiaohongshu.com
      },
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
    // Experimental native search path (disabled by default)
    if (xhsNativeSearchEnabled) {
      return this.experimentalNativeSearch(query, req, signal);
    }

    // Production: do not start browser. Signal registry to use general-web fallback.
    return {
      items: [],
      error: {
        code: "runtime-unavailable",
        message: "native search disabled — using general web discovery",
        retryable: false,
      },
    };
  }

  private async experimentalNativeSearch(
    query: string,
    req?: SourceSearchRequest,
    signal?: AbortSignal,
  ): Promise<SourceSearchOutcome> {
    const isAuth = await this.runtime.verifyAuthenticationForOperation("xiaohongshu", signal);
    if (!isAuth) {
      return {
        items: [],
        error: { code: "auth-required", message: "Xiaohongshu session is not authenticated", retryable: false },
      };
    }

    const maxResults = Math.min(req?.maxResults || 10, 30);
    const searchUrl = buildXhsSearchUrl(query);

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

      // Wait for search results to populate (structured or DOM), up to 12s
      let resultsReady = false;
      const readyStart = Date.now();
      while (!resultsReady && Date.now() - readyStart < 12000) {
        if (signal?.aborted) break;
        const chk = await page.call(extractXhsSearchState, [], signal);
        if (chk && chk.available && chk.feeds.length > 0) {
          resultsReady = true;
          break;
        }
        const domCount = await page.evaluate<number>("document.querySelectorAll('section.note-item').length", signal);
        if (domCount > 0) {
          resultsReady = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      const collectedMap = new Map<string, SourceItem>();
      let stagnantCount = 0;
      const maxScrolls = 6;

      for (let s = 0; s < maxScrolls; s++) {
        if (signal?.aborted) break;

        const beforeCount = collectedMap.size;

        // 1. Structured extraction (PRIMARY)
        try {
          const structured = await page.call(extractXhsSearchState, [], signal);
          if (structured && structured.available && Array.isArray(structured.feeds)) {
            for (const feed of structured.feeds) {
              const item = normalizeXhsFeed(feed);
              if (item && !collectedMap.has(item.id)) {
                collectedMap.set(item.id, item);
              }
            }
          }
        } catch {
          // Structured extraction fallback to DOM
        }

        // 2. DOM extraction (FALLBACK / SUPPLEMENT)
        if (collectedMap.size < maxResults) {
          try {
            const domBatch: XhsNoteExtraction[] = await page.call(extractVisibleXhsSearch, [], signal);
            for (const domItem of domBatch) {
              if (!collectedMap.has(domItem.id)) {
                collectedMap.set(domItem.id, {
                  id: domItem.id,
                  title: domItem.title,
                  url: domItem.url,
                  snippet: domItem.snippet,
                  author: domItem.authorName ? { name: domItem.authorName, url: domItem.authorUrl } : undefined,
                  likes: domItem.likes,
                  coverImage: domItem.coverImage,
                  platform: "xiaohongshu",
                });
              }
            }
          } catch {
            // Ignore DOM errors
          }
        }

        if (collectedMap.size >= maxResults) break;

        if (collectedMap.size === beforeCount) {
          stagnantCount++;
          if (stagnantCount >= 2) break;
        } else {
          stagnantCount = 0;
        }

        await page.scrollBy(700, signal);
      }

      const items = Array.from(collectedMap.values()).slice(0, maxResults);
      return { items };
    } catch (err: any) {
      if (signal?.aborted) {
        return { items: [], error: { code: "aborted", message: "Search operation was aborted", retryable: false } };
      }
      if (err.name === "UrlDisallowedError") {
        return { items: [], error: { code: "blocked", message: err.message, retryable: false } };
      }
      if (err.name === "NavigationTimeoutError" || err.name === "SelectorTimeoutError") {
        return { items: [], error: { code: "navigation-timeout", message: err.message, retryable: true } };
      }
      return { items: [], error: { code: "parse-failed", message: err.message, retryable: true } };
    } finally {
      await page.close();
    }
  }

  async fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome> {
    const isAuth = await this.runtime.verifyAuthenticationForOperation("xiaohongshu", signal);
    if (!isAuth) {
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

      const noteId = extractNoteIdFromUrl(url);
      let detail: any;

      // 1. Structured detail (PRIMARY) — poll __INITIAL_STATE__.note.noteDetailMap directly
      // Does NOT wait for DOM selectors; if structured state is present, returns immediately
      if (noteId) {
        const structStart = Date.now();
        while (Date.now() - structStart < 3500) {
          if (signal?.aborted) break;
          try {
            const structured = await page.call(extractXhsDetailState, [noteId], signal);
            if (structured && structured.available && (structured.title || structured.text)) {
              detail = structured;
              break;
            }
          } catch {
            // Retry next tick
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      }

      // 2. DOM extraction (FALLBACK only when structured state is unavailable)
      if (!detail) {
        try {
          await page.waitForSelector("#detail-title, .title, .security-verify, #detail-desc, .desc", 5000, signal);
          detail = await page.call(extractXhsNoteDetail, [], signal);
        } catch {
          // DOM fallback failed
        }
      }

      if (!detail) {
        return { error: { code: "parse-failed", message: "Could not extract note detail", retryable: true } };
      }

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
          collects: detail.collects,
          replies: detail.comments,
          images: detail.images,
          platform: "xiaohongshu",
        },
      };
    } catch (err: any) {
      if (signal?.aborted) {
        return { error: { code: "aborted", message: "Fetch operation was aborted", retryable: false } };
      }
      if (err.name === "UrlDisallowedError") {
        return { error: { code: "blocked", message: err.message, retryable: false } };
      }
      if (err.name === "NavigationTimeoutError" || err.name === "SelectorTimeoutError") {
        return { error: { code: "navigation-timeout", message: err.message, retryable: true } };
      }
      return { error: { code: "parse-failed", message: err.message, retryable: true } };
    } finally {
      await page.close();
    }
  }
}

function extractNoteIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // /explore/<noteId> or /search_result/<noteId>
    const match = parsed.pathname.match(/\/(?:explore|search_result)\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
