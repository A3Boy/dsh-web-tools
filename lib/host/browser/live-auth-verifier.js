import { CdpClient } from "./cdp/client.js";
import { CdpPage } from "./cdp/page.js";
import { waitForStableXhsPageState } from "./xiaohongshu-page-state.js";
function isXiaohongshuUrl(url) {
    if (!url)
        return false;
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return hostname === "xiaohongshu.com" || hostname.endsWith(".xiaohongshu.com");
    }
    catch {
        return false;
    }
}
function xiaohongshuPagePriority(url) {
    if (!url)
        return 3;
    try {
        const parsed = new URL(url);
        if (parsed.pathname === "/explore" || parsed.pathname === "/")
            return 0;
        if (parsed.pathname.startsWith("/search_result"))
            return 1;
        return 2;
    }
    catch {
        return 3;
    }
}
/** Verify browser-visible session usability after the cookie-presence gate. */
export const verifyLiveBrowserSession = async ({ platform, cdp, signal }) => {
    if (platform !== "xiaohongshu")
        return true;
    try {
        const targets = await cdp.send("Target.getTargets", {}, undefined, signal);
        const pages = (targets.targetInfos || []).filter((target) => target.type === "page");
        const xiaohongshuPages = pages
            .filter((page) => isXiaohongshuUrl(page.url))
            .sort((a, b) => xiaohongshuPagePriority(a.url) - xiaohongshuPagePriority(b.url));
        if (xiaohongshuPages.length === 0) {
            const target = pages[0];
            if (!target)
                return false;
            let attachedSessionId;
            try {
                const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true }, undefined, signal);
                attachedSessionId = attached.sessionId;
                const page = new CdpPage(target.targetId, attached.sessionId, cdp, async () => { });
                // A cold browser starts on its internal new-tab page. Reuse that target
                // instead of creating a second visible tab.
                await page.navigate("https://www.xiaohongshu.com/explore", signal);
                return await waitForStableXhsPageState(page, signal) === "ready";
            }
            finally {
                if (attachedSessionId) {
                    try {
                        await cdp.send("Target.detachFromTarget", { sessionId: attachedSessionId }, undefined, undefined, 2000);
                    }
                    catch { }
                }
            }
        }
        // A restored profile can contain both a usable /explore page and a detail
        // page showing a route-specific login wall. One restricted tab must not
        // invalidate the whole authenticated profile. Prefer stable entry pages,
        // then accept the session when any existing Xiaohongshu page is usable.
        for (const target of xiaohongshuPages) {
            let attachedSessionId;
            try {
                const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true }, undefined, signal);
                attachedSessionId = attached.sessionId;
                const page = new CdpPage(target.targetId, attached.sessionId, cdp, async () => { });
                await page.waitForLoad(signal);
                if (await waitForStableXhsPageState(page, signal) === "ready")
                    return true;
            }
            catch {
                // A single stale/closing target is inconclusive; inspect the remaining
                // existing Xiaohongshu pages before declaring the profile signed out.
            }
            finally {
                if (attachedSessionId) {
                    try {
                        await cdp.send("Target.detachFromTarget", { sessionId: attachedSessionId }, undefined, undefined, 2000);
                    }
                    catch { }
                }
            }
        }
        return false;
    }
    catch {
        return false;
    }
};
