import { createNativeBrowserRuntime } from "../browser/index.js";
import { extractXhsSearchState, extractVisibleXhsSearch, extractXhsDetailState, extractXhsCommentState, extractXhsNoteDetail, } from "./browser-scripts/xiaohongshu.js";
import { normalizeXhsFeed } from "./xiaohongshu/normalize.js";
import { extractXhsComments } from "./xiaohongshu/comments.js";
import { navigateXhsSearchViaUi } from "./xiaohongshu/ui-search.js";
import { appendCommentsToItem } from "./comments.js";
// Native search is the production default. Operators can temporarily disable
// it with XHS_NATIVE_SEARCH=0 when diagnosing platform or browser issues.
let xhsNativeSearchEnabled = (process.env.XHS_NATIVE_SEARCH ?? "1") !== "0";
export function setXhsNativeSearchEnabled(v) { xhsNativeSearchEnabled = v; }
export function isXhsNativeSearchEnabled() { return xhsNativeSearchEnabled; }
export class XiaohongshuSource {
    id = "xiaohongshu";
    name = "小红书";
    runtime;
    noteUrlCache = new Map();
    constructor(runtime) {
        this.runtime = runtime || createNativeBrowserRuntime();
    }
    async status() {
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
                nativeSearch: isXhsNativeSearchEnabled(), // signed-in in-platform search
                nativeFetch: true, // XHS detail fetch using the dedicated browser profile
                webSearchFallback: true, // general web discovery via site:xiaohongshu.com
            },
            account: sessionStatus.accountLabel
                ? { handle: sessionStatus.accountLabel, name: sessionStatus.accountLabel }
                : undefined,
            lastError: sessionStatus.lastError,
            lastCheckedAt: sessionStatus.verifiedAt || Date.now(),
        };
    }
    async search(query, req, signal) {
        // Prefer the signed-in in-platform search path.
        if (xhsNativeSearchEnabled) {
            return this.nativeSearch(query, req, signal);
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
    async nativeSearch(query, req, signal) {
        const isAuth = await this.runtime.verifyAuthenticationForOperation("xiaohongshu", signal, "interactive");
        if (!isAuth) {
            return {
                items: [],
                error: { code: "auth-required", message: "Xiaohongshu session is not authenticated", retryable: false },
            };
        }
        const maxResults = Math.min(req?.maxResults || 10, 30);
        let page;
        try {
            page = await this.runtime.createPage("xiaohongshu", signal, "interactive");
        }
        catch (err) {
            if (err.name === "UrlDisallowedError") {
                return { items: [], error: { code: "blocked", message: err.message, retryable: false } };
            }
            return { items: [], error: { code: "runtime-unavailable", message: err.message, retryable: true } };
        }
        try {
            const navigation = await navigateXhsSearchViaUi(page, query, signal);
            if (navigation.state !== "ready") {
                const code = navigation.state === "signed-out"
                    ? "auth-expired"
                    : navigation.state === "login-wall"
                        ? navigation.stage === "explore" ? "auth-expired" : "search-restricted"
                        : navigation.state === "security-verification"
                            ? "blocked"
                            : "parse-failed";
                return {
                    items: [],
                    error: {
                        code,
                        message: `Xiaohongshu UI search did not become ready (${navigation.state} at ${navigation.stage})`,
                        retryable: false,
                    },
                };
            }
            // Wait for search results to populate (structured or DOM), up to 12s
            let resultsReady = false;
            const readyStart = Date.now();
            while (!resultsReady && Date.now() - readyStart < 12000) {
                if (signal?.aborted)
                    break;
                const chk = await page.call(extractXhsSearchState, [], signal);
                if (chk && chk.available && chk.feeds.length > 0) {
                    resultsReady = true;
                    break;
                }
                const domCount = await page.evaluate("document.querySelectorAll('section.note-item').length", signal);
                if (domCount > 0) {
                    resultsReady = true;
                    break;
                }
                await new Promise((r) => setTimeout(r, 400));
            }
            const collectedMap = new Map();
            let stagnantCount = 0;
            const maxScrolls = 6;
            for (let s = 0; s < maxScrolls; s++) {
                if (signal?.aborted)
                    break;
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
                }
                catch {
                    // Structured extraction fallback to DOM
                }
                // 2. DOM extraction (FALLBACK / SUPPLEMENT)
                if (collectedMap.size < maxResults) {
                    try {
                        const domBatch = await page.call(extractVisibleXhsSearch, [], signal);
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
                    }
                    catch {
                        // Ignore DOM errors
                    }
                }
                if (collectedMap.size >= maxResults)
                    break;
                if (collectedMap.size === beforeCount) {
                    stagnantCount++;
                    if (stagnantCount >= 2)
                        break;
                }
                else {
                    stagnantCount = 0;
                }
                await page.scrollBy(700, signal);
            }
            const items = Array.from(collectedMap.values()).slice(0, maxResults);
            for (const item of items)
                this.rememberNoteUrl(item.id, item.url);
            return { items };
        }
        catch (err) {
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
        }
        finally {
            await page.close();
        }
    }
    async fetch(url, signal) {
        const noteId = extractNoteIdFromUrl(url);
        if (!noteId) {
            return {
                error: {
                    code: "parse-failed",
                    message: `Could not identify Xiaohongshu note ID from ${url}`,
                    retryable: false,
                },
            };
        }
        const navigationUrl = hasXhsAccessToken(url)
            ? url
            : this.noteUrlCache.get(noteId) || url;
        const isAuth = await this.runtime.verifyAuthenticationForOperation("xiaohongshu", signal, "interactive");
        if (!isAuth) {
            return { error: { code: "auth-required", message: "Xiaohongshu session is not authenticated", retryable: false } };
        }
        let page;
        let commentCapture;
        try {
            // Xiaohongshu currently rejects the headless browser fingerprint with an
            // "安全限制 / IP存在风险" page even when the dedicated profile is signed in.
            // Use the same persisted profile in a minimized interactive browser.
            page = await this.runtime.createPage("xiaohongshu", signal, "interactive");
        }
        catch (err) {
            return { error: { code: "runtime-unavailable", message: err.message, retryable: true } };
        }
        try {
            commentCapture = await page.beginJsonCapture({
                urlIncludes: "/api/sns/web/v2/comment/page",
                timeoutMs: 15000,
                signal,
            });
            await page.navigate(navigationUrl, signal);
            await page.waitForLoad(signal);
            const finalUrl = await page.evaluate("location.href", signal);
            const finalNoteId = extractNoteIdFromUrl(finalUrl);
            if (finalNoteId !== noteId) {
                return {
                    error: {
                        code: "blocked",
                        message: `Xiaohongshu detail navigation redirected away from target note ${noteId}`,
                        retryable: false,
                    },
                };
            }
            this.rememberNoteUrl(noteId, finalUrl);
            let detail;
            let structuredCommentPayload;
            // 1. Structured detail (PRIMARY) — poll __INITIAL_STATE__.note.noteDetailMap directly
            // Does NOT wait for DOM selectors; if structured state is present, returns immediately
            const structStart = Date.now();
            while (Date.now() - structStart < 3500) {
                if (signal?.aborted)
                    break;
                try {
                    const structured = await page.call(extractXhsDetailState, [noteId], signal);
                    if (structured &&
                        structured.available &&
                        (structured.title?.trim() || structured.text?.trim())) {
                        detail = structured;
                        try {
                            structuredCommentPayload = await page.call(extractXhsCommentState, [noteId], signal);
                        }
                        catch {
                            // Detail is still valid; comments can arrive later or via network capture.
                        }
                        break;
                    }
                }
                catch {
                    // Retry next tick
                }
                await new Promise((r) => setTimeout(r, 250));
            }
            // 2. DOM extraction (FALLBACK only when structured state is unavailable)
            if (!detail) {
                try {
                    await page.waitForSelector("#detail-title, .title, .security-verify, #detail-desc, .desc", 5000, signal);
                    const domDetail = await page.call(extractXhsNoteDetail, [], signal);
                    if (domDetail?.isBlocked ||
                        domDetail?.title?.trim() ||
                        domDetail?.text?.trim()) {
                        detail = domDetail;
                    }
                }
                catch {
                    // DOM fallback failed
                }
            }
            if (!detail) {
                return { error: { code: "parse-failed", message: "Could not extract note detail", retryable: true } };
            }
            if (detail.isBlocked) {
                return {
                    error: {
                        code: "blocked",
                        message: "Xiaohongshu security verification or access restriction required",
                        retryable: false,
                    },
                };
            }
            const item = {
                id: url,
                title: detail.title || "小红书笔记",
                url,
                text: detail.text?.trim() || detail.title?.trim(),
                author: detail.authorName ? { name: detail.authorName, url: detail.authorUrl } : undefined,
                publishedAt: detail.publishedAt,
                likes: detail.likes,
                collects: detail.collects,
                replies: detail.comments,
                images: detail.images,
                platform: "xiaohongshu",
            };
            // The detail page hydrates its initial comment page into noteDetailMap.
            // Prefer that deterministic state over waiting for a network request that
            // may have completed before the CDP listener was attached.
            if (!structuredCommentPayload && (detail.comments || 0) > 0) {
                const commentStart = Date.now();
                while (Date.now() - commentStart < 4000) {
                    if (signal?.aborted)
                        break;
                    try {
                        structuredCommentPayload = await page.call(extractXhsCommentState, [noteId], signal);
                    }
                    catch {
                        // Keep polling while the SPA hydrates its comment state.
                    }
                    if (structuredCommentPayload)
                        break;
                    await new Promise((resolve) => setTimeout(resolve, 250));
                }
            }
            if (structuredCommentPayload) {
                commentCapture.cancel();
                const parsed = extractXhsComments(structuredCommentPayload);
                return {
                    item: appendCommentsToItem(item, parsed.comments, {
                        heading: "Comments",
                        truncated: parsed.truncated || (detail.comments || 0) > parsed.comments.length,
                    }),
                    retrievalMode: "native-browser",
                };
            }
            const commentOutcome = await commentCapture.wait();
            if (commentOutcome.state === "captured" && commentOutcome.status >= 200 && commentOutcome.status < 300) {
                const parsed = extractXhsComments(commentOutcome.json);
                return {
                    item: appendCommentsToItem(item, parsed.comments, {
                        heading: "Comments",
                        truncated: parsed.truncated || (detail.comments || 0) > parsed.comments.length,
                    }),
                    retrievalMode: "native-browser",
                };
            }
            return {
                item: appendCommentsToItem(item, [], {
                    heading: "Comments",
                    truncated: (detail.comments || 0) > 0,
                }),
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
            commentCapture?.cancel();
            await page.close();
        }
    }
    rememberNoteUrl(noteId, url) {
        if (!noteId || !hasXhsAccessToken(url))
            return;
        this.noteUrlCache.delete(noteId);
        this.noteUrlCache.set(noteId, url);
        while (this.noteUrlCache.size > 100) {
            const oldest = this.noteUrlCache.keys().next().value;
            if (!oldest)
                break;
            this.noteUrlCache.delete(oldest);
        }
    }
}
function hasXhsAccessToken(url) {
    try {
        return Boolean(new URL(url).searchParams.get("xsec_token"));
    }
    catch {
        return false;
    }
}
function extractNoteIdFromUrl(url) {
    try {
        const parsed = new URL(url);
        // /explore/<noteId>, /search_result/<noteId>, or shared /discovery/item/<noteId>
        const match = parsed.pathname.match(/\/(?:explore|search_result|discovery\/item)\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }
    catch {
        return null;
    }
}
