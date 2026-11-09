import { createNativeBrowserRuntime } from "../browser/index.js";
import { extractVisibleXTweets, } from "./browser-scripts/x.js";
import { extractCommentsFromTweetDetail, extractTweetFromTweetDetail, extractTweetIdFromUrl, extractTweetsFromSearchTimeline, isSearchTimelineResponse, isTweetDetailResponse, } from "./x/normalize.js";
import { appendCommentsToItem } from "./comments.js";
import { verifyPlatformSession } from "./auth.js";
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
async function readXPageDiagnostics(page, signal) {
    try {
        const info = await page.evaluate(`(() => {
        const text = (document.body && document.body.innerText ? document.body.innerText : "")
          .replace(/\\s+/g, " ")
          .slice(0, 160);
        let graphql = 0;
        try {
          graphql = performance.getEntriesByType("resource")
            .filter((e) => e.name.indexOf("/i/api/graphql/") !== -1).length;
        } catch {}
        return {
          href: location.href,
          title: document.title || "",
          text,
          tweets: document.querySelectorAll("article[data-testid='tweet']").length,
          graphql,
        };
      })()`, signal);
        if (!info)
            return undefined;
        const bits = [`href=${info.href}`, `tweets=${info.tweets}`, `graphql=${info.graphql}`];
        if (info.title)
            bits.push(`title=${info.title.slice(0, 60)}`);
        if (info.text)
            bits.push(`text=${info.text.slice(0, 120)}`);
        return bits.join(", ");
    }
    catch {
        return undefined;
    }
}
async function collectTweetsViaDom(page, maxResults, signal) {
    try {
        await page.waitForSelector("article[data-testid='tweet']", 8000, signal);
    }
    catch {
        // Empty search result or loading slow
    }
    const collectedMap = new Map();
    let noNewCount = 0;
    const maxScrolls = 6;
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
    // paid API tier): topic searches are dominated by reply noise and bot spam,
    // so replies are excluded unless the caller explicitly asked for them.
    const raw = (req?.hints?.rawQuery ?? query).toLowerCase();
    if (!/filter:replies|回复|replies/.test(raw))
        q += " -filter:replies";
    if (/视频|video/.test(raw))
        q += " filter:videos";
    else if (/图片|图文|image|photo/.test(raw))
        q += " filter:images";
    // Only when the caller asked for popularity: a global engagement floor would
    // erase exactly the niche terms a platform search is usually used for.
    if (/热门|最火|高赞|trending|viral/.test(raw))
        q += " min_faves:10";
    // `f=live` switches the UI from relevance-ranked "Top" to chronological
    // "Latest". The news topic wants it by default; the search fallback asks for
    // it explicitly when "Top" produced nothing usable.
    const fParam = forceLatest || req?.hints?.topic === "news" ? "&f=live" : "";
    return `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query${fParam}`;
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
        if (top.items.length > 0)
            return top;
        if (top.error && !top.error.retryable)
            return top;
        if (signal?.aborted)
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
            page = await this.runtime.createPage("x", signal);
        }
        catch (err) {
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
                    if (graphItems.length >= maxResults) {
                        return { items: graphItems.slice(0, maxResults), retrievalMode: "native-browser" };
                    }
                    // Thin GraphQL results (or valid 0 tweets): supplement via DOM and merge.
                    // GraphQL items take priority on field overlap; if both yield 0, it is a valid native 0.
                    const domItems = await collectTweetsViaDom(page, maxResults, signal);
                    const mergedMap = new Map();
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
            const diagnostics = await readXPageDiagnostics(page, signal);
            return {
                items: [],
                error: {
                    code: "parse-failed",
                    message: "X search produced no GraphQL response and no DOM tweets" +
                        (diagnostics ? ` [${diagnostics}]` : ""),
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
    async fetch(url, signal) {
        const isAuth = await verifyPlatformSession(this.runtime, "x", signal);
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
