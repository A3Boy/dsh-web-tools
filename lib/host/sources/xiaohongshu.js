import { createNativeBrowserRuntime } from "../browser/index.js";
import { extractXhsSearchState, extractVisibleXhsSearch, extractXhsDetailState, extractXhsCommentState, extractXhsNoteDetail, } from "./browser-scripts/xiaohongshu.js";
import { normalizeXhsFeed } from "./xiaohongshu/normalize.js";
import { extractXhsComments } from "./xiaohongshu/comments.js";
import { navigateXhsSearchViaUi } from "./xiaohongshu/ui-search.js";
import { appendCommentsToItem } from "./comments.js";
import { verifyPlatformSession } from "./auth.js";
import { resolveXhsOriginalImage, withMediaSection } from "./media.js";
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
const globalNoteUrlCache = new Map();
const globalNoteItemCache = new Map();
export function rememberGlobalNote(item) {
    if (!item || !item.id)
        return;
    globalNoteItemCache.set(item.id, item);
    if (item.url && hasXhsAccessToken(item.url)) {
        globalNoteUrlCache.set(item.id, item.url);
    }
}
export function getCachedNoteItem(id) {
    return globalNoteItemCache.get(id);
}
export function getCachedNoteUrl(id) {
    return globalNoteUrlCache.get(id);
}
export function clearGlobalNoteCache() {
    globalNoteUrlCache.clear();
    globalNoteItemCache.clear();
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
    const item = {
        id,
        title,
        url,
        snippet: desc ? desc.slice(0, 200) : undefined,
        text: desc || title,
        author: user?.nickname
            ? {
                name: String(user.nickname),
                url: userId ? `https://www.xiaohongshu.com/user/profile/${userId}` : undefined,
            }
            : undefined,
        likes: parseXhsCount(interact?.liked_count ?? interact?.likedCount),
        collects: parseXhsCount(interact?.collected_count ?? interact?.collectedCount),
        replies: parseXhsCount(interact?.comment_count ?? interact?.commentCount),
        coverImage: resolveXhsOriginalImage(cover?.url_default ?? cover?.urlDefault ?? cover?.url_pre ?? cover?.urlPre),
        platform: "xiaohongshu",
    };
    rememberGlobalNote(item);
    return item;
}
export const XHS_SORT_TAG_MAP = {
    general: "综合",
    time_descending: "最新",
    popularity_descending: "最多点赞",
    comment_descending: "最多评论",
    collect_descending: "最多收藏",
};
/** Build the site's own search-results URL (the page then fetches the JSON). */
export function buildXhsSearchUrl(query, req) {
    const params = new URLSearchParams();
    params.set("keyword", query);
    params.set("source", "web_search_result_notes");
    const sort = req?.hints?.sort;
    if (sort && sort !== "general") {
        params.set("sort", sort);
    }
    else {
        const preset = req?.hints?.freshness?.preset;
        if (preset === "day" || preset === "week")
            params.set("sort", "time_descending");
    }
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
/**
 * What the search page actually did, for a failed capture.
 *
 * Distinguishes "the SPA never called the API" (endpoint changed / login wall)
 * from "the call happened but the response was not captured".
 */
async function readXhsPageDiagnostics(page, signal) {
    try {
        const info = await page.evaluate(`(() => {
        let apis = [];
        try {
          apis = performance.getEntriesByType("resource")
            .map((e) => e.name)
            .filter((n) => n.indexOf("/api/") !== -1)
            .slice(-6);
        } catch {}
        return {
          href: location.href,
          title: document.title || "",
          apis,
          notes: document.querySelectorAll("section.note-item").length,
        };
      })()`, signal);
        if (!info)
            return "no-diag";
        return `href=${info.href.slice(0, 120)} notes=${info.notes} title=${info.title.slice(0, 40)} apis=[${info.apis.join(" ")}]`;
    }
    catch {
        return "no-diag";
    }
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
                urlIncludes: "/search/notes",
                timeoutMs: 8000,
                signal,
            });
            await page.navigate(buildXhsSearchUrl(query, req), signal);
            const collected = new Map();
            const addNotes = (notes) => {
                for (const note of notes) {
                    const mapped = mapXhsApiNote(note);
                    if (mapped && !collected.has(mapped.id))
                        collected.set(mapped.id, mapped);
                }
            };
            const addItems = (batch) => {
                for (const item of batch)
                    if (!collected.has(item.id))
                        collected.set(item.id, item);
            };
            const sort = req?.hints?.sort;
            const targetTag = sort && sort !== "general" ? XHS_SORT_TAG_MAP[sort] : undefined;
            const finish = () => {
                let items = Array.from(collected.values());
                if (sort === "popularity_descending") {
                    items.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
                }
                else if (sort === "comment_descending") {
                    items.sort((a, b) => (b.replies ?? 0) - (a.replies ?? 0));
                }
                else if (sort === "collect_descending") {
                    items.sort((a, b) => (b.collects ?? 0) - (a.collects ?? 0));
                }
                items = items.slice(0, maxResults);
                for (const item of items)
                    this.rememberNoteUrl(item.id, item.url);
                return { items, retrievalMode: "native-browser" };
            };
            if (targetTag) {
                // When explicit sort is requested, trigger the filter tag so the page issues
                // the signed /search/notes request with sort_type filters applied.
                await new Promise((resolve) => setTimeout(resolve, 600));
                await page.evaluate(`((tagName) => {
            const panel = document.querySelector(".filter-panel, .filter-container");
            if (!panel) {
              const filterBtn = document.querySelector(".filter") || document.querySelector(".filter-icon");
              if (filterBtn) filterBtn.click();
            }
            const allTags = Array.from(document.querySelectorAll(".filter-panel .tags, .filter-container .tags"));
            const target = allTags.find(t => t.textContent.trim() === tagName);
            if (target) target.click();
          })(${JSON.stringify(targetTag)})`, signal).catch(() => { });
            }
            else {
                // SSR FIRST for general sort: the notes are already in DOM/__INITIAL_STATE__.
                const readyBy = Date.now() + 3000;
                while (Date.now() < readyBy && !signal?.aborted) {
                    const early = await this.readRenderedNotes(page, maxResults, signal);
                    if (early.length > 0) {
                        addItems(early);
                        break;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 250));
                }
            }
            // First API page (waits for captured response if tag clicked or SSR was empty).
            if (collected.size === 0) {
                const outcome = await capture.wait();
                if (outcome && outcome.state === "captured" && outcome.json) {
                    addNotes(extractXhsNotesFromSearchPayload(outcome.json));
                }
                else if (!targetTag) {
                    const diag = await readXhsPageDiagnostics(page, signal);
                    return { outcome: null, reason: `xhs-url: ${outcome?.state ?? "no-response"} [${diag}]` };
                }
            }
            // Fallback to rendered notes if capture didn't produce items
            if (collected.size === 0) {
                const fallbackItems = await this.readRenderedNotes(page, maxResults, signal);
                addItems(fallbackItems);
            }
            if (collected.size >= maxResults)
                return { outcome: finish() };
            // DEEPER PAGES: scroll so the SITE issues its own signed next-page
            // request, and capture that response.
            let stagnant = 0;
            for (let pageNo = 0; pageNo < 3 && collected.size < maxResults && !signal?.aborted; pageNo++) {
                const before = collected.size;
                let next;
                try {
                    next = await page.beginJsonCapture({
                        urlIncludes: "/search/notes",
                        timeoutMs: 6000,
                        signal,
                    });
                    await page.scrollBy(1400, signal);
                    const res = await next.wait();
                    if (res?.state === "captured" &&
                        typeof res.status === "number" &&
                        res.status >= 200 &&
                        res.status < 300) {
                        addNotes(extractXhsNotesFromSearchPayload(res.json));
                    }
                }
                catch {
                    // A failed page stops pagination; the collected items are still good.
                    break;
                }
                finally {
                    next?.cancel();
                }
                if (collected.size === before) {
                    stagnant++;
                    if (stagnant >= 2)
                        break;
                }
                // Polite jitter between pages.
                await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 200));
            }
            if (collected.size === 0)
                return { outcome: null, reason: "xhs-url: 0 items" };
            return { outcome: finish() };
        }
        catch (err) {
            return { outcome: null, reason: `xhs-url: ${err?.message ?? "threw"}` };
        }
        finally {
            capture?.cancel();
        }
    }
    /**
     * Notes already rendered on the page (SSR / hydrated state), capped and
     * de-duplicated. Used before waiting on any network response.
     */
    async readRenderedNotes(page, maxResults, signal) {
        const items = [];
        const seen = new Set();
        const push = (item) => {
            if (!item || seen.has(item.id))
                return;
            seen.add(item.id);
            items.push(item);
        };
        try {
            const state = await page.call(extractXhsSearchState, [], signal);
            if (state?.available && Array.isArray(state.feeds)) {
                for (const feed of state.feeds)
                    push(normalizeXhsFeed(feed));
            }
        }
        catch {
            // Hydration state is optional.
        }
        if (items.length < maxResults) {
            try {
                const dom = await page.call(extractVisibleXhsSearch, [], signal);
                for (const d of dom) {
                    push({
                        id: d.id,
                        title: d.title,
                        url: d.url,
                        snippet: d.snippet,
                        author: d.authorName ? { name: d.authorName, url: d.authorUrl } : undefined,
                        likes: d.likes,
                        coverImage: d.coverImage,
                        platform: "xiaohongshu",
                    });
                }
            }
            catch {
                // DOM extraction is best-effort.
            }
        }
        return items.slice(0, maxResults);
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
            const sort = hints?.sort && hints.sort !== "general"
                ? hints.sort
                : hints?.freshness?.preset === "day" || hints?.freshness?.preset === "week"
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
            const navigation = await navigateXhsSearchViaUi(page, query, signal, req?.hints?.sort);
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
            let items = Array.from(collectedMap.values());
            const sort = req?.hints?.sort;
            if (sort === "popularity_descending") {
                items.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
            }
            else if (sort === "comment_descending") {
                items.sort((a, b) => (b.replies ?? 0) - (a.replies ?? 0));
            }
            else if (sort === "collect_descending") {
                items.sort((a, b) => (b.collects ?? 0) - (a.collects ?? 0));
            }
            items = items.slice(0, maxResults);
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
            // Tab hygiene: the site opens its own search tab, so without this sweep a
            // long-lived profile accumulates one Xiaohongshu tab per search.
            await this.runtime.closePlatformPages?.("xiaohongshu", page.targetId, undefined);
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
        const cachedUrl = this.noteUrlCache.get(noteId) || getCachedNoteUrl(noteId);
        let navigationUrl = hasXhsAccessToken(url)
            ? url
            : cachedUrl || url;
        let searchFallbackItem = getCachedNoteItem(noteId);
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
            // Purge any stale WAF poison cookies so the session is clean
            await page.deleteCookies?.("sec_poison_id", ".xiaohongshu.com");
            await page.deleteCookies?.("sec_poison_id", "www.xiaohongshu.com");
            await page.deleteCookies?.("acw_tc", ".xiaohongshu.com");
            await page.deleteCookies?.("acw_tc", "www.xiaohongshu.com");
            // If we don't have a valid xsec_token for this note and don't have it in cache,
            // search for the note ID inside Xiaohongshu to resolve dynamic xsec_token
            if (!hasXhsAccessToken(navigationUrl) && !searchFallbackItem) {
                try {
                    await page.navigate("https://www.xiaohongshu.com/explore", signal, 8000);
                    const searchRes = await page.call(xhsSearchNotesViaApi, [{ keyword: noteId, pageSize: 5 }], signal);
                    if (searchRes && searchRes.ok && Array.isArray(searchRes.items) && searchRes.items.length > 0) {
                        const matched = searchRes.items.find((item) => {
                            const card = item?.note_card ?? item;
                            const id = card?.note_id ?? card?.noteId ?? card?.id ?? item?.id;
                            return id === noteId;
                        }) || searchRes.items[0];
                        if (matched) {
                            const mapped = mapXhsApiNote(matched);
                            if (mapped) {
                                searchFallbackItem = mapped;
                                rememberGlobalNote(mapped);
                                if (hasXhsAccessToken(mapped.url)) {
                                    navigationUrl = mapped.url;
                                    this.rememberNoteUrl(noteId, navigationUrl);
                                }
                            }
                        }
                    }
                }
                catch {
                    // Pre-search resolution is best effort
                }
            }
            await page.navigate(navigationUrl, signal, 15000, "https://www.xiaohongshu.com/explore");
            await page.waitForLoad(signal);
            const finalUrl = await page.evaluate("location.href", signal);
            const finalNoteId = extractNoteIdFromUrl(finalUrl);
            if (finalNoteId !== noteId) {
                if (searchFallbackItem) {
                    searchFallbackItem.text = withMediaSection(searchFallbackItem.text || searchFallbackItem.snippet || searchFallbackItem.title, searchFallbackItem);
                    return {
                        item: searchFallbackItem,
                        retrievalMode: "native-browser",
                    };
                }
                let errorDetail = "";
                if (finalUrl.includes("/website-login/error")) {
                    try {
                        const parsed = new URL(finalUrl);
                        const errCode = parsed.searchParams.get("error_code");
                        const errMsg = parsed.searchParams.get("error_msg");
                        if (errCode === "300031" || errMsg?.includes("当前笔记暂时无法浏览")) {
                            errorDetail = ` (小红书提示 300031: 当前笔记暂时无法浏览，可能已被作者删除、设为私密或缺少有效 xsec_token)`;
                        }
                        else if (errCode === "300017") {
                            errorDetail = ` (小红书提示 300017: 访问链接异常，缺少有效安全凭证 xsec_token)`;
                        }
                        else if (errCode) {
                            errorDetail = ` (小红书拦截 ${errCode}: ${errMsg || "安全限制"})`;
                        }
                    }
                    catch { }
                }
                return {
                    error: {
                        code: "blocked",
                        message: `Xiaohongshu detail navigation redirected away from target note ${noteId}${errorDetail}`,
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
                await page.deleteCookies?.("sec_poison_id", ".xiaohongshu.com");
                await page.deleteCookies?.("sec_poison_id", "www.xiaohongshu.com");
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
                images: detail.images?.map((u) => resolveXhsOriginalImage(u) ?? u),
                videoUrl: detail.videoUrl,
                tags: detail.tags,
                platform: "xiaohongshu",
            };
            item.text = withMediaSection(item.text, item);
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
            let commentList = [];
            let commentsTruncated = (detail.comments || 0) > 0;
            if (structuredCommentPayload) {
                commentCapture.cancel();
                const parsed = extractXhsComments(structuredCommentPayload);
                commentList = parsed.comments;
                commentsTruncated = parsed.truncated || (detail.comments || 0) > parsed.comments.length;
            }
            else {
                const commentOutcome = await commentCapture.wait();
                if (commentOutcome.state === "captured" && commentOutcome.status >= 200 && commentOutcome.status < 300) {
                    const parsed = extractXhsComments(commentOutcome.json);
                    commentList = parsed.comments;
                    commentsTruncated = parsed.truncated || (detail.comments || 0) > parsed.comments.length;
                }
            }
            // DEEPER COMMENT PAGES. Only the first page is hydrated by the detail
            // page. Scrolling the comment list makes the site request the next page
            // itself (signed), which we capture — forging /comment/page would 500.
            if (commentsTruncated && commentList.length > 0) {
                // First expand the "展开更多回复" controls on the top threads: a DOM
                // .click() lets the SPA issue its own sub-comment request, no pointer
                // simulation needed. Only the first five are opened to bound the work.
                const expanded = await this.expandCommentThreads(page, signal);
                if (expanded > 0) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    try {
                        const refreshed = await page.call(extractXhsCommentState, [noteId], signal);
                        if (refreshed) {
                            const parsed = extractXhsComments(refreshed);
                            const seen = new Set(commentList.map((c) => c.id));
                            commentList = commentList.concat(parsed.comments.filter((c) => c.id && !seen.has(c.id)));
                        }
                    }
                    catch {
                        // Expansion is best-effort; the first page is still valid.
                    }
                }
                for (let pageNo = 0; pageNo < 2 && !signal?.aborted; pageNo++) {
                    const more = await this.collectNextCommentPage(page, signal);
                    if (more.length === 0)
                        break;
                    const seen = new Set(commentList.map((c) => c.id));
                    const fresh = more.filter((c) => c.id && !seen.has(c.id));
                    if (fresh.length === 0)
                        break;
                    commentList = commentList.concat(fresh);
                    if ((detail.comments || 0) > 0 && commentList.length >= detail.comments)
                        break;
                }
                commentsTruncated = (detail.comments || 0) > commentList.length;
            }
            return {
                item: appendCommentsToItem(item, commentList, {
                    heading: "Comments",
                    truncated: commentsTruncated,
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
    /**
     * Capture the NEXT comment page that the page loads by itself.
     *
     * Scrolling the comment list (or the window) makes the site issue its own
     * signed `/api/sns/web/v2/comment/page` request; we capture that response
     * instead of forging one (a forged call answers 500 — no x-s-common).
     * Returns [] when there is nothing more or the scroll triggered no request.
     */
    async collectNextCommentPage(page, signal) {
        let capture;
        try {
            capture = await page.beginJsonCapture({
                urlIncludes: "/api/sns/web/v2/comment/page",
                timeoutMs: 5000,
                signal,
            });
            await page.evaluate(`(() => {
          const nodes = Array.from(document.querySelectorAll("div"));
          const list = nodes.find((el) => el.scrollHeight > el.clientHeight + 200 && el.querySelector(".comment-item, .comment-inner-container"));
          if (list) { list.scrollTop = list.scrollHeight; }
          else { window.scrollTo(0, document.body.scrollHeight); }
          return true;
        })()`, signal);
            const res = await capture.wait();
            if (res?.state === "captured" && typeof res.status === "number" && res.status >= 200 && res.status < 300) {
                return extractXhsComments(res.json).comments;
            }
            return [];
        }
        catch {
            return [];
        }
        finally {
            capture?.cancel();
        }
    }
    /**
     * Click up to five "expand replies" controls so the SPA hydrates sub-comments.
     *
     * A DOM `.click()` is enough: the site's own framework dispatches its signed
     * sub-comment request. No pointer simulation, no coordinate guessing.
     *
     * @returns how many controls were clicked (0 when none are present).
     */
    async expandCommentThreads(page, signal) {
        try {
            const clicked = await page.evaluate(`(() => {
          const nodes = Array.from(document.querySelectorAll("span, div, button, a"));
          const buttons = nodes.filter((el) => {
            if (el.children.length > 0) return false;
            const text = (el.textContent || "").trim();
            return /展开.*回复|更多回复|展开更多|查看全部回复/.test(text);
          }).slice(0, 5);
          for (const b of buttons) { try { b.click(); } catch {} }
          return buttons.length;
        })()`, signal);
            return typeof clicked === "number" ? clicked : 0;
        }
        catch {
            return 0;
        }
    }
    rememberNoteUrl(noteId, url) {
        if (!noteId || !hasXhsAccessToken(url))
            return;
        this.noteUrlCache.delete(noteId);
        this.noteUrlCache.set(noteId, url);
        globalNoteUrlCache.delete(noteId);
        globalNoteUrlCache.set(noteId, url);
        while (this.noteUrlCache.size > 100) {
            const oldest = this.noteUrlCache.keys().next().value;
            if (!oldest)
                break;
            this.noteUrlCache.delete(oldest);
        }
    }
}
export function hasXhsAccessToken(url) {
    try {
        return Boolean(new URL(url).searchParams.get("xsec_token"));
    }
    catch {
        return false;
    }
}
export function extractNoteIdFromUrl(url) {
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
