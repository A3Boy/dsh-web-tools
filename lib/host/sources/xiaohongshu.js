import { createNativeBrowserRuntime } from "../browser/index.js";
import { extractXhsSearchState, extractVisibleXhsSearch, extractXhsDetailState, extractXhsCommentState, extractXhsNoteDetail, } from "./browser-scripts/xiaohongshu.js";
import { normalizeXhsFeed } from "./xiaohongshu/normalize.js";
import { extractXhsComments } from "./xiaohongshu/comments.js";
import { navigateXhsSearchViaUi } from "./xiaohongshu/ui-search.js";
import { appendCommentsToItem } from "./comments.js";
import { verifyPlatformSession } from "./auth.js";
import { xhsSearchNotesViaApi } from "./browser-scripts/xhs-api.js";
// Native search is the production default. Operators can temporarily disable
// it with XHS_NATIVE_SEARCH=0 when diagnosing platform or browser issues.
let xhsNativeSearchEnabled = (process.env.XHS_NATIVE_SEARCH ?? "1") !== "0";
export function setXhsNativeSearchEnabled(v) { xhsNativeSearchEnabled = v; }
export function isXhsNativeSearchEnabled() { return xhsNativeSearchEnabled; }
/** Parse "1.2万" / "3,412" / 88 into a number. */
export function parseXhsCount(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value !== "string")
        return undefined;
    const clean = value.trim().replace(/,/g, "");
    if (/^\d+$/.test(clean))
        return parseInt(clean, 10);
    const wan = /^([\d.]+)\s*[万wW]$/.exec(clean);
    if (wan)
        return Math.round(parseFloat(wan[1]) * 10000);
    const k = /^([\d.]+)\s*[kK]$/.exec(clean);
    if (k)
        return Math.round(parseFloat(k[1]) * 1000);
    return undefined;
}
/**
 * Map one `/search/notes` item into a SourceItem.
 *
 * The real payload wraps each hit as
 * `{ id, model_type, note_card: { display_title, desc, user, interact_info,
 *    cover, xsec_token, type } }` — the note fields live under `note_card`, so
 * unwrap it before reading. Some responses (and older fixtures) are already
 * flat; both shapes are accepted.
 *
 * The URL keeps `xsec_token`: without it a later note fetch is redirected to
 * the login wall, which is why the UI-scraped path lost details whenever the
 * DOM link dropped the token.
 */
export function mapXhsApiNote(note) {
    const card = note?.note_card ?? note?.noteCard ?? note ?? {};
    const id = card?.note_id ?? card?.noteId ?? card?.id ?? note?.id ?? note?.note_id;
    if (typeof id !== "string" || id.length === 0)
        return null;
    const token = card?.xsec_token ?? card?.xsecToken ?? note?.xsec_token ?? note?.xsecToken;
    const base = `https://www.xiaohongshu.com/explore/${id}`;
    const url = typeof token === "string" && token.length > 0
        ? `${base}?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_search`
        : base;
    const desc = typeof card?.desc === "string" ? card.desc : "";
    const title = (typeof card?.display_title === "string" && card.display_title.trim()) ||
        (typeof card?.title === "string" && card.title.trim()) ||
        (desc ? desc.split(/\r?\n/)[0].slice(0, 60) : "小红书笔记");
    const user = card?.user ?? {};
    const interact = card?.interact_info ?? card?.interactInfo ?? {};
    const cover = card?.cover ?? {};
    const userId = user?.user_id ?? user?.userId;
    return {
        id,
        title,
        url,
        snippet: desc ? desc.slice(0, 200) : undefined,
        author: user?.nickname
            ? {
                name: String(user.nickname),
                url: userId ? `https://www.xiaohongshu.com/user/profile/${userId}` : undefined,
            }
            : undefined,
        likes: parseXhsCount(interact?.liked_count ?? interact?.likedCount),
        collects: parseXhsCount(interact?.collected_count ?? interact?.collectedCount),
        replies: parseXhsCount(interact?.comment_count ?? interact?.commentCount),
        coverImage: cover?.url_default ?? cover?.urlDefault ?? cover?.url_pre ?? cover?.urlPre,
        platform: "xiaohongshu",
    };
}
/** Build the site's own search-results URL (the page then fetches the JSON). */
export function buildXhsSearchUrl(query, req) {
    const params = new URLSearchParams();
    params.set("keyword", query);
    params.set("source", "web_search_result_notes");
    const preset = req?.hints?.freshness?.preset;
    if (preset === "day" || preset === "week")
        params.set("sort", "time_descending");
    return `https://www.xiaohongshu.com/search_result?${params.toString()}`;
}
/** Pull note entries out of a captured `/search/notes` response payload. */
export function extractXhsNotesFromSearchPayload(json) {
    const root = json;
    const data = root?.data ?? root;
    if (Array.isArray(data?.items))
        return data.items;
    if (Array.isArray(data?.notes))
        return data.notes;
    return [];
}
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
    /**
     * Fastest path: open the site's own search URL and CAPTURE the JSON the page
     * itself requests.
     *
     * Forging the request requires the site's full signature header set
     * (`X-S`, `X-T`, `x-S-Common`, `X-B3-Traceid`); with only the first two the
     * endpoint answers 500. Letting the page issue its own signed request avoids
     * that entirely — no headers to fake, no paid API — and still yields the JSON
     * (with note_card + xsec_token) instead of DOM scraping.
     */
    async searchViaDirectUrl(page, query, req, maxResults, signal) {
        let capture;
        try {
            capture = await page.beginJsonCapture({
                urlIncludes: "/api/sns/web/v1/search/notes",
                timeoutMs: 12000,
                signal,
            });
            await page.navigate(buildXhsSearchUrl(query, req), signal);
            const outcome = await capture.wait();
            if (!outcome || outcome.state !== "captured") {
                return { outcome: null, reason: `xhs-url: ${outcome?.state ?? "no-response"}` };
            }
            if (typeof outcome.status === "number" && (outcome.status < 200 || outcome.status >= 300)) {
                return { outcome: null, reason: `xhs-url: status=${outcome.status}` };
            }
            const notes = extractXhsNotesFromSearchPayload(outcome.json);
            if (notes.length === 0)
                return { outcome: null, reason: "xhs-url: 0 items" };
            const items = [];
            const seen = new Set();
            for (const note of notes) {
                const mapped = mapXhsApiNote(note);
                if (!mapped || seen.has(mapped.id))
                    continue;
                seen.add(mapped.id);
                items.push(mapped);
                if (items.length >= maxResults)
                    break;
            }
            if (items.length === 0)
                return { outcome: null, reason: "xhs-url: unmappable items" };
            for (const item of items)
                this.rememberNoteUrl(item.id, item.url);
            return { outcome: { items, retrievalMode: "native-browser" } };
        }
        catch (err) {
            return { outcome: null, reason: `xhs-url: ${err?.message ?? "threw"}` };
        }
        finally {
            capture?.cancel();
        }
    }
    /**
     * Fast path: signed in-page JSON search.
     *
     * Returns null (never throws) whenever this channel is unusable, so the
     * caller can fall back to the UI flow. Risk control, a renamed signer or an
     * empty payload are all "unusable", not "no results".
     */
    async searchViaApi(page, query, req, maxResults, signal) {
        try {
            // The API is same-origin, so the page must be on xiaohongshu.com first.
            // `navigate` already waits for a usable readyState, so no extra wait.
            await page.navigate("https://www.xiaohongshu.com/explore", signal);
            const hints = req?.hints;
            // "最新/本周" → chronological; otherwise the site's own relevance order.
            const sort = hints?.freshness?.preset === "day" || hints?.freshness?.preset === "week"
                ? "time_descending"
                : "general";
            const rawQuery = hints?.rawQuery ?? query;
            const noteType = /视频|video/i.test(rawQuery) ? 1 : /图文|图片|image/i.test(rawQuery) ? 2 : 0;
            const result = await page.call(xhsSearchNotesViaApi, [{ keyword: query, pageSize: Math.max(20, maxResults), sort, noteType }], signal);
            if (!result)
                return { outcome: null, reason: "xhs-api: no result" };
            if (!result.ok) {
                return {
                    outcome: null,
                    reason: `xhs-api: ${result.error ?? "rejected"}${result.status ? ` status=${result.status}` : ""}${result.code !== undefined ? ` code=${result.code}` : ""}`,
                };
            }
            if (!Array.isArray(result.items) || result.items.length === 0) {
                return { outcome: null, reason: "xhs-api: 0 items" };
            }
            const items = [];
            const seen = new Set();
            for (const note of result.items) {
                const mapped = mapXhsApiNote(note);
                if (!mapped || seen.has(mapped.id))
                    continue;
                seen.add(mapped.id);
                items.push(mapped);
                if (items.length >= maxResults)
                    break;
            }
            if (items.length === 0)
                return { outcome: null, reason: "xhs-api: unmappable items" };
            for (const item of items)
                this.rememberNoteUrl(item.id, item.url);
            return { outcome: { items, retrievalMode: "native-browser" } };
        }
        catch (err) {
            return { outcome: null, reason: `xhs-api: ${err?.message ?? "threw"}` };
        }
    }
    async nativeSearch(query, req, signal) {
        const isAuth = await verifyPlatformSession(this.runtime, "xiaohongshu", signal, "interactive");
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
        const channelReasons = [];
        try {
            // PRIMARY: open the site's own search URL and capture the JSON its client
            // requests. No forged headers, no paid API, ~4-6s instead of 15-25s.
            const direct = await this.searchViaDirectUrl(page, query, req, maxResults, signal);
            if (direct.outcome)
                return direct.outcome;
            if (direct.reason)
                channelReasons.push(direct.reason);
            // SECOND: call the endpoint from inside the page with the site's signer.
            // Needs the full signature header set to be accepted; kept as a cheap
            // attempt because it is the fastest when it works.
            const api = await this.searchViaApi(page, query, req, maxResults, signal);
            if (api.outcome)
                return api.outcome;
            if (api.reason)
                channelReasons.push(api.reason);
            // FALLBACK: drive the search UI (survives a signer rename or a
            // risk-control payload on the JSON channel).
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
            // Keep the fast-path failure reason: without it a 20s UI search looks
            // identical to one where the API channel was never attempted.
            return { items, ...(channelReasons.length ? { diagnostics: channelReasons } : {}) };
        }
        catch (err) {
            if (signal?.aborted) {
                return { items: [], error: { code: "aborted", message: "Search operation was aborted", retryable: false } };
            }
            if (err.name === "UrlDisallowedError") {
                return {
                    items: [],
                    error: { code: "blocked", message: err.message, retryable: false },
                    ...(channelReasons.length ? { diagnostics: channelReasons } : {}),
                };
            }
            if (err.name === "NavigationTimeoutError" || err.name === "SelectorTimeoutError") {
                return {
                    items: [],
                    error: { code: "navigation-timeout", message: err.message, retryable: true },
                    ...(channelReasons.length ? { diagnostics: channelReasons } : {}),
                };
            }
            return {
                items: [],
                error: { code: "parse-failed", message: err.message, retryable: true },
                ...(channelReasons.length ? { diagnostics: channelReasons } : {}),
            };
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
        const isAuth = await verifyPlatformSession(this.runtime, "xiaohongshu", signal, "interactive");
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
