import { createNativeBrowserRuntime, type NativeBrowserRuntime, type CdpPageLease } from "../browser/index.ts";
import {
  extractVisibleXTweets,
  type XTweetExtraction,
} from "./browser-scripts/x.ts";
import {
  extractTweetFromTweetDetail,
  extractTweetIdFromUrl,
  extractTweetsFromSearchTimeline,
  isSearchTimelineResponse,
  isTweetDetailResponse,
} from "./x/normalize.ts";
import type {
  SpecializedSource,
  SourceStatus,
  SourceSearchRequest,
  SourceSearchOutcome,
  SourceFetchOutcome,
  SourceItem,
} from "./types.ts";

const LOGIN_REDIRECT_RE = /\/i\/flow\/login|\/account\/access|challenge/i;

/** Wait for the real X search page and collect tweets via DOM (fallback path). */
async function collectTweetsViaDom(
  page: CdpPageLease,
  maxResults: number,
  signal?: AbortSignal,
): Promise<SourceItem[]> {
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
          text: item.text,
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

  return Array.from(collectedMap.values()).slice(0, maxResults);
}

function isExpiredSessionResponse(status: number): boolean {
  return status === 401 || status === 403;
}

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
    let capture;
    try {
      // Blank attached page — capture listeners must be in place BEFORE the
      // SPA fires SearchTimeline, so openPage() (which navigates eagerly) is
      // not usable here.
      page = await this.runtime.createPage("x", signal);
    } catch (err: any) {
      if (err.name === "UrlDisallowedError") {
        return { items: [], error: { code: "blocked", message: err.message, retryable: false } };
      }
      return { items: [], error: { code: "runtime-unavailable", message: err.message, retryable: true } };
    }

    try {
      // PRIMARY: capture the SearchTimeline GraphQL response over CDP.
      capture = await page.beginJsonCapture({
        urlIncludes: "/SearchTimeline",
        timeoutMs: 8000,
        signal,
      });
      await page.navigate(searchUrl, signal);
      const outcome = await capture.wait();

      if (signal?.aborted || outcome.state === "aborted") {
        return {
          items: [],
          error: { code: "aborted", message: "Search operation was aborted", retryable: false },
        };
      }

      // Session can exist in cookies but be dead server-side — never fake 0.
      if (outcome.state === "captured" && isExpiredSessionResponse(outcome.status)) {
        return {
          items: [],
          error: { code: "auth-expired", message: `X search returned HTTP ${outcome.status}`, retryable: false },
        };
      }

      // Check for login redirect regardless of outcome state (e.g. timeout due to redirect)
      try {
        const pageUrl = await page.evaluate<string>("window.location.href", signal);
        if (LOGIN_REDIRECT_RE.test(pageUrl)) {
          return {
            items: [],
            error: { code: "auth-expired", message: "X redirected to the login flow", retryable: false },
          };
        }
      } catch {
        // URL check is best-effort
      }

      if (outcome.state === "captured") {
        const schemaRecognized = isSearchTimelineResponse(outcome.json);
        if (schemaRecognized) {
          const graphItems = extractTweetsFromSearchTimeline(outcome.json);
          if (graphItems.length >= maxResults) {
            return { items: graphItems.slice(0, maxResults), retrievalMode: "native-browser" };
          }

          // Thin GraphQL results (or valid 0 tweets): supplement via DOM and merge.
          // GraphQL items take priority on field overlap; if both yield 0, it is a valid native 0.
          const domItems = await collectTweetsViaDom(page, maxResults, signal);
          const mergedMap = new Map<string, SourceItem>();
          for (const item of graphItems) {
            mergedMap.set(item.id, item);
          }
          for (const item of domItems) {
            if (!mergedMap.has(item.id)) {
              mergedMap.set(item.id, item);
            }
          }
          return { items: Array.from(mergedMap.values()).slice(0, maxResults), retrievalMode: "native-browser" };
        }

        // Captured but schema NOT recognized (X changed the envelope) → the
        // GraphQL path is dead; fall through to DOM so general-web fallback
        // still has a chance to run if the DOM is also empty.
      }

      // Capture failed or schema unrecognized → DOM fallback.
      const domItems = await collectTweetsViaDom(page, maxResults, signal);
      if (domItems.length > 0) {
        return { items: domItems, retrievalMode: "native-browser" };
      }
      return {
        items: [],
        error: { code: "parse-failed", message: "X search produced no GraphQL response and no DOM tweets", retryable: true },
      };
    } catch (err: any) {
      if (signal?.aborted) {
        return {
          items: [],
          error: { code: "aborted", message: "Search operation was aborted", retryable: false },
        };
      }
      if (err.name === "UrlDisallowedError") {
        return { items: [], error: { code: "blocked", message: err.message, retryable: false } };
      }
      return { items: [], error: { code: "parse-failed", message: err.message, retryable: true } };
    } finally {
      capture?.cancel();
      await page.close();
    }
  }

  async fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome> {
    const isAuth = await this.runtime.verifyAuthenticationForOperation("x", signal);
    if (!isAuth) {
      return { error: { code: "auth-required", message: "Twitter / X session is not authenticated", retryable: false } };
    }

    const targetTweetId = extractTweetIdFromUrl(url);
    if (!targetTweetId) {
      return { error: { code: "parse-failed", message: `Invalid X status URL: "${url}"`, retryable: false } };
    }

    let page;
    let capture;
    try {
      page = await this.runtime.createPage("x", signal);
    } catch (err: any) {
      if (err.name === "UrlDisallowedError") {
        return { error: { code: "blocked", message: err.message, retryable: false } };
      }
      return { error: { code: "runtime-unavailable", message: err.message, retryable: true } };
    }

    try {
      // PRIMARY: capture TweetDetail GraphQL response over CDP.
      capture = await page.beginJsonCapture({
        urlIncludes: "/TweetDetail",
        timeoutMs: 8000,
        signal,
      });
      await page.navigate(url, signal);
      const outcome = await capture.wait();

      if (signal?.aborted || outcome.state === "aborted") {
        return { error: { code: "aborted", message: "Fetch operation was aborted", retryable: false } };
      }

      if (outcome.state === "captured" && isExpiredSessionResponse(outcome.status)) {
        return { error: { code: "auth-expired", message: `X tweet fetch returned HTTP ${outcome.status}`, retryable: false } };
      }

      try {
        const pageUrl = await page.evaluate<string>("window.location.href", signal);
        if (LOGIN_REDIRECT_RE.test(pageUrl)) {
          return { error: { code: "auth-expired", message: "X redirected to the login flow", retryable: false } };
        }
      } catch {
        // Best-effort URL check
      }

      if (outcome.state === "captured" && isTweetDetailResponse(outcome.json)) {
        const target = extractTweetFromTweetDetail(outcome.json, targetTweetId);
        if (target) {
          return { item: target, retrievalMode: "native-browser" };
        }
      }

      // FALLBACK: DOM extraction matching the EXACT targetTweetId
      await page.waitForLoad(signal);
      try {
        await page.waitForSelector("article[data-testid='tweet']", 8000, signal);
      } catch {
        // Slow or empty DOM
      }

      const batch: XTweetExtraction[] = await page.call(extractVisibleXTweets, [], signal);
      const matched = batch.find((item) => item.id === targetTweetId);

      if (!matched) {
        return {
          error: {
            code: "parse-failed",
            message: `Target tweet ${targetTweetId} not found in page`,
            retryable: true,
          },
        };
      }

      return {
        item: {
          id: matched.id,
          title: matched.text.slice(0, 80) || "X Tweet",
          url: matched.url,
          text: matched.text,
          snippet: matched.text,
          author: matched.authorHandle
            ? { name: matched.authorName || matched.authorHandle, handle: matched.authorHandle }
            : undefined,
          publishedAt: matched.publishedAt,
          likes: matched.likes,
          retweets: matched.retweets,
          replies: matched.replies,
          platform: "x",
        },
        retrievalMode: "native-browser",
      };
    } catch (err: any) {
      if (signal?.aborted) {
        return { error: { code: "aborted", message: "Fetch operation was aborted", retryable: false } };
      }
      if (err.name === "UrlDisallowedError") {
        return { error: { code: "blocked", message: err.message, retryable: false } };
      }
      return { error: { code: "parse-failed", message: err.message, retryable: true } };
    } finally {
      capture?.cancel();
      await page.close();
    }
  }
}
