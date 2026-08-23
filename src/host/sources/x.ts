import { createNativeBrowserRuntime, type NativeBrowserRuntime } from "../browser/index.ts";
import {
  extractVisibleXTweets,
  type XTweetExtraction,
} from "./browser-scripts/x.ts";
import type {
  SpecializedSource,
  SourceStatus,
  SourceSearchRequest,
  SourceSearchOutcome,
  SourceFetchOutcome,
  SourceItem,
} from "./types.ts";

export function parseXMetricNumber(text?: string): number | undefined {
  if (!text) return undefined;
  const clean = text.trim().replace(/,/g, "");
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);
  const kMatch = clean.match(/^([\d.]+)\s*[kK]$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const mMatch = clean.match(/^([\d.]+)\s*[mM]$/);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
  return undefined;
}

export function buildXSearchUrl(query: string, req?: SourceSearchRequest): string {
  let q = query.trim();
  // Note: lang: filter is intentionally omitted. SearchHints.locale.language
  // is inferred from the user's instruction language, not from an explicit
  // "only search in this language" intent. Adding lang: here would incorrectly
  // filter out relevant results (e.g. "在X上搜索 OpenAI" would add lang:zh).
  // Future: reintroduce only when SearchHints exposes languageExplicit flag.
  if (req?.hints?.freshness) {
    const { after, before } = req.hints.freshness;
    if (after) {
      q += ` since:${after}`;
    }
    if (before) {
      q += ` until:${before}`;
    }
  }

  const fParam = req?.hints?.topic === "news" ? "&f=live" : "";
  return `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query${fParam}`;
}

export class XSource implements SpecializedSource {
  readonly id = "x" as const;
  readonly name = "Twitter / X";
  private runtime: NativeBrowserRuntime;

  constructor(runtime?: NativeBrowserRuntime) {
    this.runtime = runtime || createNativeBrowserRuntime();
  }

  async status(): Promise<SourceStatus> {
    const sessionStatus = await this.runtime.status("x");
    return {
      id: "x",
      name: "Twitter / X",
      enabled: true,
      runtimeAvailable: sessionStatus.runtimeAvailable,
      runtimeState: sessionStatus.runtimeState,
      authenticated: sessionStatus.authenticated,
      sessionEstablished: sessionStatus.sessionEstablished,
      capabilities: {
        nativeSearch: true,     // X search via headless native browser
        nativeFetch: true,      // X tweet detail via headless native browser
        webSearchFallback: true,
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
    const isAuth = await this.runtime.verifyAuthenticationForOperation("x", signal);
    if (!isAuth) {
      return {
        items: [],
        error: { code: "auth-required", message: "Twitter / X session is not authenticated", retryable: false },
      };
    }

    const maxResults = Math.min(req?.maxResults || 10, 30);
    const searchUrl = buildXSearchUrl(query, req);

    let page;
    try {
      page = await this.runtime.openPage("x", searchUrl, signal);
    } catch (err: any) {
      if (err.name === "UrlDisallowedError") {
        return { items: [], error: { code: "blocked", message: err.message, retryable: false } };
      }
      return { items: [], error: { code: "runtime-unavailable", message: err.message, retryable: true } };
    }

    try {
      await page.waitForLoad(signal);
      try {
        await page.waitForSelector("article[data-testid='tweet']", 8000, signal);
      } catch {
        // Empty search result or loading slow
      }

      const collectedMap = new Map<string, SourceItem>();
      let noNewCount = 0;
      const maxScrolls = 6;

      for (let s = 0; s < maxScrolls; s++) {
        if (signal?.aborted) break;

        const batch: XTweetExtraction[] = await page.call(extractVisibleXTweets, [], signal);
        let addedThisBatch = 0;

        for (const item of batch) {
          if (!collectedMap.has(item.id)) {
            collectedMap.set(item.id, {
              id: item.id,
              title: item.text.slice(0, 80) || "X Tweet",
              url: item.url,
              snippet: item.text,
              author: item.authorHandle
                ? { name: item.authorName || item.authorHandle, handle: item.authorHandle }
                : undefined,
              publishedAt: item.publishedAt,
              likes: item.likes,
              retweets: item.retweets,
              replies: item.replies,
              platform: "x",
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
    const isAuth = await this.runtime.verifyAuthenticationForOperation("x", signal);
    if (!isAuth) {
      return { error: { code: "auth-required", message: "Twitter / X session is not authenticated", retryable: false } };
    }

    let page;
    try {
      page = await this.runtime.openPage("x", url, signal);
    } catch (err: any) {
      return { error: { code: "runtime-unavailable", message: err.message, retryable: true } };
    }

    try {
      await page.waitForLoad(signal);
      await page.waitForSelector("article[data-testid='tweet']", 8000, signal);

      const batch: XTweetExtraction[] = await page.call(extractVisibleXTweets, [], signal);
      const target = batch[0];

      if (!target) {
        return { error: { code: "parse-failed", message: "Target tweet not found in page", retryable: true } };
      }

      return {
        item: {
          id: target.id,
          title: target.text.slice(0, 80) || "X Tweet",
          url: target.url,
          text: target.text,
          author: target.authorHandle
            ? { name: target.authorName || target.authorHandle, handle: target.authorHandle }
            : undefined,
          publishedAt: target.publishedAt,
          likes: target.likes,
          retweets: target.retweets,
          replies: target.replies,
          platform: "x",
        },
      };
    } catch (err: any) {
      return { error: { code: "parse-failed", message: err.message, retryable: true } };
    } finally {
      await page.close();
    }
  }
}
