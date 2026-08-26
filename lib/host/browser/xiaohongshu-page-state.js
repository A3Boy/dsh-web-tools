/** Browser-executed detector. Keep self-contained because CdpPage.call serializes it. */
export function detectXhsPageState() {
    const href = location.href;
    const bodyText = document.body?.innerText || "";
    const visible = (element) => {
        if (!element)
            return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    if (visible(document.querySelector(".security-verify, #security-verify")) ||
        /captcha|security.?verification/i.test(href) ||
        /安全验证|安全限制|IP存在风险|访问受限|异常访问|操作频繁/.test(`${document.title}\n${bodyText}`)) {
        return "security-verification";
    }
    if (/website-login|\/login(?:\/|\?|$)/i.test(href))
        return "signed-out";
    if (visible(document.querySelector(".login-modal, .login-container")) ||
        /登录后推荐更懂你的笔记|登录后查看/.test(bodyText)) {
        return "login-wall";
    }
    return "ready";
}
/** Wait for hydration and require repeated observations before trusting page auth state. */
export async function waitForStableXhsPageState(page, signal, options = {}) {
    const settleMs = options.settleMs ?? 800;
    const intervalMs = options.intervalMs ?? 300;
    const consecutive = options.consecutive ?? 3;
    const maxSamples = options.maxSamples ?? 7;
    if (settleMs > 0)
        await new Promise((resolve) => setTimeout(resolve, settleMs));
    let last;
    let repeated = 0;
    for (let i = 0; i < maxSamples; i++) {
        if (signal?.aborted)
            throw new Error("Xiaohongshu page-state probe aborted");
        const current = await page.call(detectXhsPageState, [], signal);
        if (current === last)
            repeated++;
        else {
            last = current;
            repeated = 1;
        }
        if (repeated >= consecutive)
            return current;
        if (intervalMs > 0 && i + 1 < maxSamples) {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
    }
    return last ?? "signed-out";
}
