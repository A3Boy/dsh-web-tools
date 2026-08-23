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
        let loadPromiseResolve;
        let loadPromiseReject;
        const loadPromise = new Promise((resolve, reject) => {
            loadPromiseResolve = resolve;
            loadPromiseReject = reject;
        });
        let offLoad;
        const timeout = 30000;
        const timer = setTimeout(() => {
            if (offLoad)
                offLoad();
            loadPromiseReject(new NavigationTimeoutError(url, timeout));
        }, timeout);
        offLoad = this.client.on("Page.loadEventFired", (_params, sid) => {
            if (sid === this.sessionId) {
                clearTimeout(timer);
                if (offLoad)
                    offLoad();
                loadPromiseResolve();
            }
        });
        try {
            await this.client.send("Page.navigate", { url }, this.sessionId, signal);
            await loadPromise;
        }
        finally {
            clearTimeout(timer);
            if (offLoad)
                offLoad();
        }
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
