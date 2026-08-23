import { CdpClient } from "./client.js";
import { NavigationTimeoutError, SelectorTimeoutError } from "./errors.js";
export class CdpPage {
    targetId;
    sessionId;
    client;
    onClose;
    constructor(targetId, sessionId, client, onClose) {
        this.targetId = targetId;
        this.sessionId = sessionId;
        this.client = client;
        this.onClose = onClose;
    }
    async navigate(url, signal) {
        await this.client.send("Page.enable", {}, this.sessionId, signal);
        await this.client.send("Runtime.enable", {}, this.sessionId, signal);
        // Send the navigation command but don't wait for Page.loadEventFired
        // (SPA pages like XHS may not fire it reliably on re-used sessions).
        await this.client.send("Page.navigate", { url }, this.sessionId, signal, 30000);
        // Poll for a usable readyState (handles SPA that never fires loadEventFired)
        const start = Date.now();
        const timeoutMs = 15000;
        while (Date.now() - start < timeoutMs) {
            if (signal?.aborted)
                throw new Error("navigate aborted");
            try {
                const ready = await this.evaluate("document.readyState === 'complete' || document.readyState === 'interactive'");
                if (ready)
                    return;
            }
            catch {
                // Page context may not be ready yet
            }
            await new Promise((r) => setTimeout(r, 200));
        }
        // Timeout, but don't throw — the page may still be usable
    }
    async waitForLoad(signal) {
        // Check if document.readyState is complete
        const isComplete = await this.evaluate("document.readyState === 'complete'", signal);
        if (isComplete)
            return;
        const start = Date.now();
        const timeoutMs = 15000;
        while (Date.now() - start < timeoutMs) {
            if (signal?.aborted)
                throw new Error("waitForLoad aborted");
            const ready = await this.evaluate("document.readyState === 'complete'", signal);
            if (ready)
                return;
            await new Promise((r) => setTimeout(r, 200));
        }
    }
    async waitForSelector(selector, timeoutMs = 15000, signal) {
        const start = Date.now();
        const expr = `Boolean(document.querySelector(${JSON.stringify(selector)}))`;
        while (Date.now() - start < timeoutMs) {
            if (signal?.aborted)
                throw new Error("waitForSelector aborted");
            const found = await this.evaluate(expr, signal);
            if (found)
                return;
            await new Promise((r) => setTimeout(r, 250));
        }
        throw new SelectorTimeoutError(selector, timeoutMs);
    }
    async evaluate(expression, signal) {
        const res = await this.client.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
        }, this.sessionId, signal);
        if (res.exceptionDetails) {
            const desc = res.exceptionDetails.exception?.description ||
                res.exceptionDetails.text ||
                "Evaluation exception";
            throw new Error(`Runtime.evaluate failed: ${desc}`);
        }
        return res.result?.value;
    }
    async call(fn, args = [], signal) {
        const fnSource = fn.toString();
        const serializedArgs = JSON.stringify(args);
        const expression = `(${fnSource})(...${serializedArgs})`;
        return this.evaluate(expression, signal);
    }
    async scrollBy(pixels, signal) {
        await this.evaluate(`window.scrollBy({ top: ${pixels}, behavior: 'smooth' })`, signal);
        await new Promise((r) => setTimeout(r, 400));
    }
    async close() {
        await this.onClose();
    }
}
