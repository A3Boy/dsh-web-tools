import { createNativeBrowserRuntime } from "../browser/index.js";
import { extractXhsSearchState, extractVisibleXhsSearch, extractXhsNoteDetail, } from "./browser-scripts/xiaohongshu.js";
import { normalizeXhsFeed } from "./xiaohongshu/normalize.js";
import { buildXhsSearchUrl } from "./xiaohongshu/query.js";
export class XiaohongshuSource {
    id = "xiaohongshu";
    name = "小红书";
    runtime;
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
            account: sessionStatus.accountLabel
                ? { handle: sessionStatus.accountLabel, name: sessionStatus.accountLabel }
                : undefined,
            lastError: sessionStatus.lastError,
            lastCheckedAt: sessionStatus.verifiedAt || Date.now(),
        };
    }
    async search(query, req, signal) {
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
        }
        catch (err) {
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
            return { items };
        }
        catch (err) {
            return { items: [], error: { code: "parse-failed", message: err.message, retryable: true } };
        }
        finally {
            await page.close();
        }
    }
    async fetch(url, signal) {
        const isAuth = await this.runtime.verifyAuthenticationForOperation("xiaohongshu", signal);
        if (!isAuth) {
            return { error: { code: "auth-required", message: "Xiaohongshu session is not authenticated", retryable: false } };
        }
        let page;
        try {
            page = await this.runtime.openPage("xiaohongshu", url, signal);
        }
        catch (err) {
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
        }
        catch (err) {
            return { error: { code: "parse-failed", message: err.message, retryable: true } };
        }
        finally {
            await page.close();
        }
    }
}
