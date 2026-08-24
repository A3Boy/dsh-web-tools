import { detectXhsPageState, extractXhsSearchState, setXhsSearchInput, submitXhsSearch, } from "../browser-scripts/xiaohongshu.js";
/** Enter XHS search through the visible home-page controls, never a direct search URL. */
export async function navigateXhsSearchViaUi(page, query, signal) {
    await page.navigate("https://www.xiaohongshu.com/explore", signal);
    await page.waitForLoad(signal);
    const initialState = await page.call(detectXhsPageState, [], signal);
    if (initialState !== "ready") {
        return { state: initialState, url: await page.evaluate("location.href", signal) };
    }
    await page.waitForSelector("#search-input", 8000, signal);
    const inputSet = await page.call(setXhsSearchInput, [query], signal);
    const submitted = inputSet && await page.call(submitXhsSearch, [], signal);
    if (!submitted) {
        return { state: "navigation-failed", url: await page.evaluate("location.href", signal) };
    }
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12000) {
        if (signal?.aborted)
            throw new Error("Xiaohongshu UI search aborted");
        const state = await page.call(detectXhsPageState, [], signal);
        const url = await page.evaluate("location.href", signal);
        if (state !== "ready")
            return { state, url };
        if (url.includes("/search_result")) {
            const structured = await page.call(extractXhsSearchState, [], signal);
            const domCount = await page.evaluate("document.querySelectorAll('section.note-item').length", signal);
            if ((structured.available && structured.feeds.length > 0) || domCount > 0) {
                return { state: "ready", url };
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return {
        state: "navigation-failed",
        url: await page.evaluate("location.href", signal),
    };
}
