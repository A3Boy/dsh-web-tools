import { createNativeBrowserRuntime } from "../browser/index.js";
import { extractVisibleXTweets, } from "./browser-scripts/x.js";
import { extractCommentsFromTweetDetail, extractTweetFromTweetDetail, extractTweetIdFromUrl, extractTweetsFromSearchTimeline, isSearchTimelineResponse, isTweetDetailResponse, } from "./x/normalize.js";
import { appendCommentsToItem } from "./comments.js";
import { verifyPlatformSession } from "./auth.js";
import { withMediaSection } from "./media.js";
import { fetchWithProxy } from "../fetch-proxy.js";
const LOGIN_REDIRECT_RE = /\/i\/flow\/login|\/account\/access|challenge/i;
/** Snapshot of what the search page actually shows, for a failed capture. */
async function readXPageSnapshot(page, signal) {
    try {
        return await page.evaluate(`(() => {
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
        // Conservative: a login LINK exists on the site chrome even when signed
        // in, so the CTA flag is only a hint. The authoritative signal is the
        // URL (login redirect) combined with "nothing loaded at all".
        const loginCta = !!document.querySelector('a[href="/login"], a[href="/i/flow/login"]')
          || bodyText.indexOf("sign in to x") !== -1
          || bodyText.indexOf("log in to x") !== -1;
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
      })()`, signal);
    }
    catch {
        return undefined;
    }
}
/**
 * Only treat the page as a logged-out shell on STRONG evidence.
 *
 * A cold SPA boot renders the site chrome (which contains a "Log in" link)
 * before hydration, so linkage alone proves nothing — that false positive is
 * exactly what made a valid session look signed out.
 */
function isLoggedOutShell(snap) {
    if (!snap)
        return false;
    if (/\/login\b|\/i\/flow\/login/.test(snap.href))
        return true;
    return (!snap.loggedIn &&
        snap.graphql === 0 &&
        snap.tweets === 0 &&
        /sign in to x|log in to x/.test(snap.text.toLowerCase()));
}
function describeXPageSnapshot(info) {
    const bits = [
        `href=${info.href}`,
        `ready=${info.readyState}`,
        `tweets=${info.tweets}`,
        `graphql=${info.graphql}`,
        `loggedIn=${info.loggedIn}`,
        `loginCta=${info.loginCta}`,
    ];
    if (info.title)
        bits.push(`title=${info.title.slice(0, 60)}`);
    if (info.text)
        bits.push(`text=${info.text.slice(0, 120)}`);
    return bits.join(", ");
}
async function collectTweetsViaDom(page, maxResults, signal, opts = {}) {
    try {
        await page.waitForSelector("article[data-testid='tweet']", opts.selectorTimeoutMs ?? 8000, signal);
    }
    catch {
        // Empty search result or loading slow
    }
    const collectedMap = new Map();
    let noNewCount = 0;
    const maxScrolls = opts.maxScrolls ?? 6;
    for (let s = 0; s < maxScrolls; s++) {
        if (signal?.aborted)
            break;
        const batch = await page.call(extractVisibleXTweets, [], signal);
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
        if (collectedMap.size >= maxResults)
            break;
        if (addedThisBatch === 0) {
            noNewCount++;
            if (noNewCount >= 2)
                break;
        }
        else {
            noNewCount = 0;
        }
        await page.scrollBy(700, signal);
    }
    return Array.from(collectedMap.values()).slice(0, maxResults);
}
function isExpiredSessionResponse(status) {
    return status === 401 || status === 403;
}
export function parseXMetricNumber(text) {
    if (!text)
        return undefined;
    const clean = text.trim().replace(/,/g, "");
    if (/^\d+$/.test(clean))
        return parseInt(clean, 10);
    const kMatch = clean.match(/^([\d.]+)\s*[kK]$/);
    if (kMatch)
        return Math.round(parseFloat(kMatch[1]) * 1000);
    const mMatch = clean.match(/^([\d.]+)\s*[mM]$/);
    if (mMatch)
        return Math.round(parseFloat(mMatch[1]) * 1000000);
    return undefined;
}
export function buildXSearchUrl(query, req, forceLatest = false) {
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
    if (isAsciiQuery && !/filter:replies|回复|replies/.test(raw))
        q += " -filter:replies";
    if (isAsciiQuery && /视频|video/.test(raw))
        q += " filter:videos";
    else if (isAsciiQuery && /图片|图文|image|photo/.test(raw))
        q += " filter:images";
    // Only when the caller asked for popularity: a global engagement floor would
    // erase exactly the niche terms a platform search is usually used for.
    if (isAsciiQuery && /热门|最火|高赞|trending|viral/.test(raw))
        q += " min_faves:10";
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
export function mapSyndicationTweet(json, fallbackUrl) {
    const text = typeof json?.text === "string" ? json.text : "";
    const user = json?.user ?? {};
    const id = json?.id_str ?? json?.id;
    if (!id && !text)
        return null;
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
/** Fetch one tweet from X's public embed endpoint (no auth, no browser). */
async function defaultSyndicationFetcher(tweetId, signal) {
    try {
        const res = await fetchWithProxy(`https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=zh-cn&token=a`, { signal, headers: { accept: "application/json" } });
        if (!res.ok)
            return null;
        const json = await res.json();
        return json && typeof json === "object" ? json : null;
    }
    catch {
        return null;
    }
}
let syndicationFetcher = defaultSyndicationFetcher;
/** Test seam: replace the network fetcher (pass a null-returning stub). */
export function setSyndicationFetcher(fn) {
    syndicationFetcher = fn;
}
export class XSource {
    id = "x";
    name = "Twitter / X";
    runtime;
    constructor(runtime) {
        this.runtime = runtime || createNativeBrowserRuntime();
    }
    async status() {
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
                nativeSearch: true, // X search via headless native browser
                nativeFetch: true, // X tweet detail via headless native browser
                webSearchFallback: true,
            },
            account: sessionStatus.accountLabel
                ? { handle: sessionStatus.accountLabel, name: sessionStatus.accountLabel }
                : undefined,
            lastError: sessionStatus.lastError,
            lastCheckedAt: sessionStatus.verifiedAt || Date.now(),
        };
    }
    async search(query, req, signal) {
        const isAuth = await verifyPlatformSession(this.runtime, "x", signal, "interactive");
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
        if (top.items.length > 0)
            return top;
        if (top.error && !top.error.retryable)
            return top;
        if (signal?.aborted)
            return top;
        // A page that never hydrated will not hydrate on a second navigation
        // either — retrying the other tab would just double the wait.
        if (top.error?.message.includes("did not hydrate"))
            return top;
        // Pass 2 — "Latest". Niche or CJK keywords frequently have no Top matches
        // while the chronological tab still does. Without this retry the router
        // degraded to a `site:x.com` web search, which matches tokens loosely and
        // surfaced years-old unrelated tweets.
        const latest = await this.searchOnce(buildXSearchUrl(query, req, true), maxResults, signal);
        if (latest.items.length > 0)
            return latest;
        if (latest.error && !latest.error.retryable)
            return latest;
        return top.error ? top : latest;
    }
    /** One navigation + capture attempt against a concrete search URL. */
    async searchOnce(searchUrl, maxResults, signal) {
        let page;
        let capture;
        try {
            // Blank attached page — capture listeners must be in place BEFORE the
            // SPA fires SearchTimeline, so openPage() (which navigates eagerly) is
            // not usable here.
            page = await this.runtime.createPage("x", signal, "interactive");
        }
        catch (err) {
            if (err.name === "UrlDisallowedError") {
                return { items: [], error: { code: "blocked", message: err.message, retryable: false } };
            }
            return { items: [], error: { code: "runtime-unavailable", message: err.message, retryable: true } };
        }
        try {
            // PRIMARY: capture the SearchTimeline GraphQL response over CDP.
            // 6s: against a warm (cached) bundle the SPA fires SearchTimeline within
            // a couple of seconds. A longer window only delays the fallback, and the
            // page is inspected below to decide whether a wait is even worthwhile.
            capture = await page.beginJsonCapture({
                urlIncludes: "/SearchTimeline",
                timeoutMs: 6000,
                signal,
            });
            // Direct navigation only. A /home warm-up is a full hard reload, so it
            // does NOT preserve the hydrated app — it just costs another 4-6s. The
            // snapshot below detects an unhydrated shell and reports it instead.
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
                const pageUrl = await page.evaluate("window.location.href", signal);
                if (LOGIN_REDIRECT_RE.test(pageUrl)) {
                    return {
                        items: [],
                        error: { code: "auth-expired", message: "X redirected to the login flow", retryable: false },
                    };
                }
            }
            catch {
                // URL check is best-effort
            }
            if (outcome.state === "captured") {
                const schemaRecognized = isSearchTimelineResponse(outcome.json);
                if (schemaRecognized) {
                    const graphItems = extractTweetsFromSearchTimeline(outcome.json);
                    const mergedMap = new Map();
                    for (const item of graphItems)
                        mergedMap.set(item.id, item);
                    // Thin GraphQL results: supplement via a short DOM pass (2s/2 scrolls).
                    if (mergedMap.size < maxResults) {
                        const domItems = await collectTweetsViaDom(page, maxResults, signal, {
                            selectorTimeoutMs: 2000,
                            maxScrolls: 2,
                        });
                        for (const item of domItems) {
                            if (!mergedMap.has(item.id))
                                mergedMap.set(item.id, item);
                        }
                    }
                    // DEEPER PAGES: scrolling makes x.com issue the next SearchTimeline
                    // (with a bottom cursor); capture and merge it instead of forging a
                    // GraphQL request ourselves.
                    let stagnant = 0;
                    for (let pageNo = 0; pageNo < 2 && mergedMap.size < maxResults && !signal?.aborted; pageNo++) {
                        const before = mergedMap.size;
                        let next;
                        try {
                            next = await page.beginJsonCapture({
                                urlIncludes: "/SearchTimeline",
                                timeoutMs: 6000,
                                signal,
                            });
                            await page.scrollBy(1600, signal);
                            const res = await next.wait();
                            if (res?.state === "captured" && isSearchTimelineResponse(res.json)) {
                                for (const item of extractTweetsFromSearchTimeline(res.json)) {
                                    if (!mergedMap.has(item.id))
                                        mergedMap.set(item.id, item);
                                }
                            }
                        }
                        catch {
                            break;
                        }
                        finally {
                            next?.cancel();
                        }
                        if (mergedMap.size === before) {
                            stagnant++;
                            if (stagnant >= 1)
                                break;
                        }
                        await new Promise((resolve) => setTimeout(resolve, 250));
                    }
                    return { items: Array.from(mergedMap.values()).slice(0, maxResults), retrievalMode: "native-browser" };
                }
                // Captured but schema NOT recognized (X changed the envelope) → the
                // GraphQL path is dead; fall through to DOM so general-web fallback
                // still has a chance to run if the DOM is also empty.
            }
            // Capture failed or schema unrecognized → inspect the page BEFORE any
            // scrolling.
            const snapshot = await readXPageSnapshot(page, signal);
            // "Hydrated" matters: a page that has rendered the search chrome (tabs,
            // account menu) is simply still LOADING the timeline, not broken. Only a
            // page with no app chrome at all deserves the fast failure.
            const hydrated = snapshot?.loggedIn === true ||
                /搜索|search/i.test(snapshot?.title ?? "") ||
                /热门|最新|Search|Latest/i.test(snapshot?.text ?? "");
            if (snapshot && snapshot.tweets === 0 && snapshot.graphql === 0 && !hydrated) {
                if (isLoggedOutShell(snapshot)) {
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
                        message: `X search page did not hydrate (no tweets, no API traffic) [${describeXPageSnapshot(snapshot)}]`,
                        retryable: true,
                    },
                    diagnostics: [describeXPageSnapshot(snapshot)],
                };
            }
            // Hydrated page: the timeline is often deferred until the viewport
            // intersects the feed container (and a minimized window throttles idle
            // work). Nudge it with real scrolls WHILE a late capture is listening,
            // instead of idling for the selector.
            if (hydrated) {
                // Foreground + built-in retry: x.com renders an inline "出错了 / 重试"
                // (Something went wrong / Retry) panel when its timeline request is
                // rejected, and does NOT retry by itself. Clicking that button is a
                // normal user action, not a forged request.
                try {
                    await page.bringToFront?.(signal);
                }
                catch {
                    // Foregrounding is best-effort.
                }
                const retried = await this.clickXRetryIfPresent(page, signal);
                let late;
                try {
                    late = await page.beginJsonCapture({
                        urlIncludes: "/SearchTimeline",
                        timeoutMs: retried ? 9000 : 6000,
                        signal,
                    });
                    for (let i = 0; i < 3 && !signal?.aborted; i++) {
                        await page.scrollBy(500, signal);
                        await new Promise((resolve) => setTimeout(resolve, 600));
                    }
                    const lateOutcome = await late.wait();
                    if (lateOutcome?.state === "captured" && isSearchTimelineResponse(lateOutcome.json)) {
                        const lateItems = extractTweetsFromSearchTimeline(lateOutcome.json);
                        if (lateItems.length > 0) {
                            return { items: lateItems.slice(0, maxResults), retrievalMode: "native-browser" };
                        }
                    }
                }
                catch {
                    // Fall through to the DOM scan.
                }
                finally {
                    late?.cancel();
                }
            }
            const domItems = await collectTweetsViaDom(page, maxResults, signal, {
                selectorTimeoutMs: hydrated ? 2500 : 2000,
                maxScrolls: hydrated ? 2 : 2,
            });
            if (domItems.length > 0) {
                return { items: domItems, retrievalMode: "native-browser" };
            }
            return {
                items: [],
                error: {
                    code: "parse-failed",
                    message: "X search produced no GraphQL response and no DOM tweets" +
                        (snapshot ? ` [${describeXPageSnapshot(snapshot)}]` : ""),
                    retryable: true,
                },
            };
        }
        catch (err) {
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
        }
        finally {
            capture?.cancel();
            await page.close();
        }
    }
    /**
     * Click x.com's inline "Something went wrong → Retry" panel if it is shown.
     *
     * The timeline request is sometimes rejected server-side; the SPA renders a
     * retry button and waits forever for a click. Returns whether one was found.
     */
    async clickXRetryIfPresent(page, signal) {
        try {
            const clicked = await page.evaluate(`(() => {
          const nodes = Array.from(document.querySelectorAll('[role="button"], button, div, span'));
          const target = nodes.find((el) => {
            const text = (el.textContent || "").trim();
            return /^(重试|Retry|Try again)$/i.test(text) && el.children.length === 0;
          });
          if (!target) return false;
          target.click();
          return true;
        })()`, signal);
            return clicked === true;
        }
        catch {
            return false;
        }
    }
    async fetch(url, signal) {
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
            if (item)
                return { item, retrievalMode: "public-api" };
        }
        const isAuth = await verifyPlatformSession(this.runtime, "x", signal, "interactive");
        if (!isAuth) {
            return { error: { code: "auth-required", message: "Twitter / X session is not authenticated", retryable: false } };
        }
        let page;
        let capture;
        try {
            page = await this.runtime.createPage("x", signal, "interactive");
        }
        catch (err) {
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
                const pageUrl = await page.evaluate("window.location.href", signal);
                if (LOGIN_REDIRECT_RE.test(pageUrl)) {
                    return { error: { code: "auth-expired", message: "X redirected to the login flow", retryable: false } };
                }
            }
            catch {
                // Best-effort URL check
            }
            if (outcome.state === "captured" && isTweetDetailResponse(outcome.json)) {
                const target = extractTweetFromTweetDetail(outcome.json, targetTweetId);
                if (target) {
                    const comments = extractCommentsFromTweetDetail(outcome.json, targetTweetId);
                    // Original-size images / highest-bitrate MP4 belong in the text: the
                    // fetch result otherwise shows only the copy.
                    target.text = withMediaSection(target.text, target);
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
            }
            catch {
                // Slow or empty DOM
            }
            const batch = await page.call(extractVisibleXTweets, [], signal);
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
        }
        catch (err) {
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
        }
        finally {
            capture?.cancel();
            await page.close();
        }
    }
}
