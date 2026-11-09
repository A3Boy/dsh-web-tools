import { createNativeBrowserRuntime, type NativeBrowserRuntime, type CdpPageLease } from "../browser/index.ts";
import {
  extractVisibleXTweets,
  type XTweetExtraction,
} from "./browser-scripts/x.ts";
import {
  extractCommentsFromTweetDetail,
  extractTweetFromTweetDetail,
  extractTweetIdFromUrl,
  extractTweetsFromSearchTimeline,
  isSearchTimelineResponse,
  isTweetDetailResponse,
} from "./x/normalize.ts";
import { appendCommentsToItem } from "./comments.ts";
import { verifyPlatformSession } from "./auth.ts";
import { fetchWithProxy } from "../fetch-proxy.ts";
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
/**
 * Snapshot of what the search page actually shows, for a failed capture.
 *
 * A bare "parse-failed" is undebuggable: the page may be a login wall, a
 * rate-limit interstitial, a consent/verification screen, or a hydrated shell
 * whose SPA never issued the SearchTimeline request. This records the facts
 * that distinguish them.
 */
interface XPageSnapshot {
  href: string;
  title: string;
  text: string;
  tweets: number;
  graphql: number;
  /** Logged-in side navigation present. */
  loggedIn: boolean;
  /** A "Log in / Sign up" call-to-action is on screen. */
  loginCta: boolean;
  readyState: string;
}

/** Snapshot of what the search page actually shows, for a failed capture. */
async function readXPageSnapshot(page: CdpPageLease, signal?: AbortSignal): Promise<XPageSnapshot | undefined> {
  try {
    return await page.evaluate<XPageSnapshot>(
      `(() => {
        const text = (document.body && document.body.innerText ? document.body.innerText : "")
          .replace(/\\s+/g, " ")
          .slice(0, 160);
        let graphql = 0;
        try {
          graphql = performance.getEntriesByType("resource")
            .filter((e) => e.name.indexOf("/i/api/graphql/") !== -1).length;
        } catch {}
        const loggedIn = !!document.querySelector(
          '[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"], a[href="/logout"]'
        );
        const bodyText = (document.body && document.body.innerText ? document.body.innerText : "").toLowerCase();
        const loginCta = !!document.querySelector('a[href="/login"], a[href="/i/flow/login"]')
          || bodyText.indexOf("sign in to x") !== -1
          || bodyText.indexOf("log in to x") !== -1
          || bodyText.indexOf("登录") !== -1;
        return {
          href: location.href,
          title: document.title || "",
          text,
          tweets: document.querySelectorAll("article[data-testid='tweet']").length,
          graphql,
          loggedIn,
          loginCta,
          readyState: document.readyState,
        };
      })()`,
      signal,
    );
  } catch {
    return undefined;
  }
}

function describeXPageSnapshot(info: XPageSnapshot): string {
  const bits = [
    `href=${info.href}`,
    `ready=${info.readyState}`,
    `tweets=${info.tweets}`,
    `graphql=${info.graphql}`,
    `loggedIn=${info.loggedIn}`,
    `loginCta=${info.loginCta}`,
  ];
  if (info.title) bits.push(`title=${info.title.slice(0, 60)}`);
  if (info.text) bits.push(`text=${info.text.slice(0, 120)}`);
  return bits.join(", ");
}

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

export function buildXSearchUrl(query: string, req?: SourceSearchRequest, forceLatest = false): string {
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

  // Quality operators. These are FREE query syntax honored by x.com itself (no
  // paid API tier): topic searches are dominated by reply noise and bot spam.
  //
  // Only applied to ASCII/Latin queries: x.com's parser mis-handles negative
  // operators combined with CJK keywords and can return 0 posts for a query
  // that has plenty of matches. Reply filtering for CJK stays client-side.
  const raw = (req?.hints?.rawQuery ?? query).toLowerCase();
  const isAsciiQuery = /^[\x00-\x7F]+$/.test(raw);
  if (isAsciiQuery && !/filter:replies|回复|replies/.test(raw)) q += " -filter:replies";
  if (isAsciiQuery && /视频|video/.test(raw)) q += " filter:videos";
  else if (isAsciiQuery && /图片|图文|image|photo/.test(raw)) q += " filter:images";
  // Only when the caller asked for popularity: a global engagement floor would
  // erase exactly the niche terms a platform search is usually used for.
  if (isAsciiQuery && /热门|最火|高赞|trending|viral/.test(raw)) q += " min_faves:10";

  // `f=live` switches the UI from relevance-ranked "Top" to chronological
  // "Latest". The news topic wants it by default; the search fallback asks for
  // it explicitly when "Top" produced nothing usable.
  const fParam = forceLatest || req?.hints?.topic === "news" ? "&f=live" : "";
  return `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query${fParam}`;
}

/**
 * Map the public syndication payload (the one X's embed widget uses) to a
 * SourceItem. Free endpoint, no auth, no browser.
 */
export function mapSyndicationTweet(json: any, fallbackUrl: string): SourceItem | null {
  const text = typeof json?.text === "string" ? json.text : "";
  const user = json?.user ?? {};
  const id = json?.id_str ?? json?.id;
  if (!id && !text) return null;
  const handle = typeof user?.screen_name === "string" ? `@${user.screen_name}` : undefined;
  return {
    id: String(id ?? ""),
    title: text.slice(0, 80) || "X Tweet",
    url: fallbackUrl,
    text: text || undefined,
    snippet: text ? text.slice(0, 240) : undefined,
    author: user?.name
      ? { name: String(user.name), handle, url: user?.screen_name ? `https://x.com/${user.screen_name}` : undefined }
      : undefined,
    publishedAt: typeof json?.created_at === "string" ? json.created_at : undefined,
    likes: typeof json?.favorite_count === "number" ? json.favorite_count : undefined,
    replies: typeof json?.conversation_count === "number" ? json.conversation_count : undefined,
    platform: "x",
  };
}

type SyndicationFetcher = (tweetId: string, signal?: AbortSignal) => Promise<any | null>;

/** Fetch one tweet from X's public embed endpoint (no auth, no browser). */
async function defaultSyndicationFetcher(tweetId: string, signal?: AbortSignal): Promise<any | null> {
  try {
    const res = await fetchWithProxy(
      `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=zh-cn&token=a`,
      { signal, headers: { accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

let syndicationFetcher: SyndicationFetcher = defaultSyndicationFetcher;

/** Test seam: replace the network fetcher (pass a null-returning stub). */
export function setSyndicationFetcher(fn: SyndicationFetcher): void {
  syndicationFetcher = fn;
}

export class XSource implements SpecializedSource {  readonly id = "x" as const;
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
    const isAuth = await verifyPlatformSession(this.runtime, "x", signal);
    if (!isAuth) {
      return {
        items: [],
        error: { code: "auth-required", message: "Twitter / X session is not authenticated", retryable: false },
      };
    }

    const maxResults = Math.min(req?.maxResults || 10, 30);

    // Pass 1 — the default ("Top") tab, which X ranks by relevance. Best for
    // evergreen or popular terms.
    const top = await this.searchOnce(buildXSearchUrl(query, req), maxResults, signal);
    if (top.items.length > 0) return top;
    if (top.error && !top.error.retryable) return top;
    if (signal?.aborted) return top;

    // Pass 2 — "Latest". Niche or CJK keywords frequently have no Top matches
    // while the chronological tab still does. Without this retry the router
    // degraded to a `site:x.com` web search, which matches tokens loosely and
    // surfaced years-old unrelated tweets.
    const latest = await this.searchOnce(buildXSearchUrl(query, req, true), maxResults, signal);
    if (latest.items.length > 0) return latest;
    if (latest.error && !latest.error.retryable) return latest;
    return top.error ? top : latest;
  }

  /** One navigation + capture attempt against a concrete search URL. */
  private async searchOnce(searchUrl: string, maxResults: number, signal?: AbortSignal): Promise<SourceSearchOutcome> {
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
      // 15s: x.com is a multi-MB SPA and through a proxy the SearchTimeline
      // request often fires 8-10s after navigation; 8s cut it off one second
      // before it happened.
      capture = await page.beginJsonCapture({
        urlIncludes: "/SearchTimeline",
        timeoutMs: 15000,
        signal,
      });
      await page.navigate(searchUrl, signal);
      const capturePromise = capture.wait();

      // Early auth sniff: a logged-out shell never fires SearchTimeline, so
      // waiting the full 15s window just delays the inevitable. Give the SPA a
      // short start-up grace, then inspect the page instead of the clock.
      const early = await Promise.race([
        capturePromise.then((o) => ({ kind: "captured" as const, outcome: o })),
        new Promise<{ kind: "early" }>((resolve) =>
          setTimeout(() => resolve({ kind: "early" as const }), 2500),
        ),
      ]);
      let outcome;
      if (early.kind === "captured") {
        outcome = early.outcome;
      } else {
        const earlySnapshot = await readXPageSnapshot(page, signal);
        if (earlySnapshot && earlySnapshot.loginCta && !earlySnapshot.loggedIn) {
          capture.cancel();
          return {
            items: [],
            error: {
              code: "auth-expired",
              message: `x.com showed the logged-out shell instead of search results [${describeXPageSnapshot(earlySnapshot)}]`,
              retryable: false,
            },
          };
        }
        outcome = await capturePromise;
      }

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
      const snapshot = await readXPageSnapshot(page, signal);
      // A logged-out shell never loads the timeline. Report it as an auth
      // problem (non-retryable) instead of a parse failure: the caller skips
      // the second tab and the user is told to sign in again.
      if (snapshot && snapshot.loginCta && !snapshot.loggedIn) {
        return {
          items: [],
          error: {
            code: "auth-expired",
            message: `x.com showed the logged-out shell instead of search results [${describeXPageSnapshot(snapshot)}]`,
            retryable: false,
          },
        };
      }
      return {
        items: [],
        error: {
          code: "parse-failed",
          message:
            "X search produced no GraphQL response and no DOM tweets" +
            (snapshot ? ` [${describeXPageSnapshot(snapshot)}]` : ""),
          retryable: true,
        },
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
      if (err.name === "NavigationTimeoutError" || err.name === "SelectorTimeoutError") {
        return { items: [], error: { code: "navigation-timeout", message: err.message, retryable: true } };
      }
      return { items: [], error: { code: "parse-failed", message: err.message, retryable: true } };
    } finally {
      capture?.cancel();
      await page.close();
    }
  }

  async fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome> {
    const targetTweetId = extractTweetIdFromUrl(url);
    if (!targetTweetId) {
      return { error: { code: "parse-failed", message: `Invalid X status URL: "${url}"`, retryable: false } };
    }

    // Fast public path FIRST: no login, no browser, no paid API. The endpoint
    // behind X's own embed widget returns the tweet JSON in milliseconds, so a
    // signed-out profile can still read a public post.
    const syndicated = await syndicationFetcher(targetTweetId, signal);
    if (syndicated) {
      const item = mapSyndicationTweet(syndicated, url);
      if (item) return { item, retrievalMode: "public-api" };
    }

    const isAuth = await verifyPlatformSession(this.runtime, "x", signal);
    if (!isAuth) {
      return { error: { code: "auth-required", message: "Twitter / X session is not authenticated", retryable: false } };
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
          const comments = extractCommentsFromTweetDetail(outcome.json, targetTweetId);
          return {
            item: appendCommentsToItem(target, comments, {
              heading: "Replies",
              truncated: (target.replies || 0) > comments.length,
            }),
            retrievalMode: "native-browser",
          };
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
      if (err.name === "NavigationTimeoutError" || err.name === "SelectorTimeoutError") {
        return { error: { code: "navigation-timeout", message: err.message, retryable: true } };
      }
      return { error: { code: "parse-failed", message: err.message, retryable: true } };
    } finally {
      capture?.cancel();
      await page.close();
    }
  }
}
