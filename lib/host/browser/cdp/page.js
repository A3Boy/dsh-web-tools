import { CdpClient } from "./client.js";
import { NavigationTimeoutError, SelectorTimeoutError } from "./errors.js";
export class CdpPage {
    targetId;
    sessionId;
    client;
    onClose;
    validateNavigation;
    closed = false;
    constructor(targetId, sessionId, client, onClose, validateNavigation) {
        this.targetId = targetId;
        this.sessionId = sessionId;
        this.client = client;
        this.onClose = onClose;
        this.validateNavigation = validateNavigation;
    }
    async navigate(url, signal, timeoutMs = 15000) {
        this.validateNavigation?.(url);
        await this.client.send("Page.enable", {}, this.sessionId, signal);
        await this.client.send("Runtime.enable", {}, this.sessionId, signal);
        // Send the navigation command
        await this.client.send("Page.navigate", { url }, this.sessionId, signal, timeoutMs);
        // Poll for a usable readyState (handles SPA that never fires loadEventFired)
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (signal?.aborted)
                throw new Error("navigate aborted");
            try {
                const ready = await this.evaluate("document.readyState === 'complete' || document.readyState === 'interactive'", signal);
                if (ready)
                    return;
            }
            catch {
                // Page context may not be ready yet
            }
            await new Promise((r) => setTimeout(r, 100));
        }
        throw new NavigationTimeoutError(url, timeoutMs);
    }
    async waitForLoad(signal, timeoutMs = 15000) {
        // Check if document.readyState is complete
        const isComplete = await this.evaluate("document.readyState === 'complete'", signal);
        if (isComplete)
            return;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (signal?.aborted)
                throw new Error("waitForLoad aborted");
            const ready = await this.evaluate("document.readyState === 'complete'", signal);
            if (ready)
                return;
            await new Promise((r) => setTimeout(r, 100));
        }
        throw new NavigationTimeoutError("Page load", timeoutMs);
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
            await new Promise((r) => setTimeout(r, 100));
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
        await new Promise((r) => setTimeout(r, 200));
    }
    /**
     * Install a JSON network capture BEFORE navigation, scoped to THIS page
     * session. Settle cleans up all listeners and timers.
     */
    async beginJsonCapture(options) {
        const { urlIncludes, timeoutMs = 6000, signal } = options;
        await this.client.send("Network.enable", {}, this.sessionId, signal);
        let settled = null;
        let resolveWait = null;
        let timer;
        const cleanupFns = [];
        const latestForRequest = new Map();
        const settle = (outcome) => {
            if (settled)
                return;
            settled = outcome;
            if (timer)
                clearTimeout(timer);
            for (const fn of cleanupFns)
                fn();
            cleanupFns.length = 0;
            if (resolveWait) {
                const r = resolveWait;
                resolveWait = null;
                r(outcome);
            }
        };
        const unsubResponse = this.client.on("Network.responseReceived", (params, eventSessionId) => {
            if (settled)
                return;
            if (eventSessionId !== this.sessionId)
                return;
            const url = params?.response?.url || "";
            if (!url.includes(urlIncludes))
                return;
            latestForRequest.set(params?.requestId, {
                url,
                status: params?.response?.status ?? 0,
            });
        });
        cleanupFns.push(unsubResponse);
        const unsubLoading = this.client.on("Network.loadingFinished", async (params, eventSessionId) => {
            if (settled)
                return;
            if (eventSessionId !== this.sessionId)
                return;
            const requestId = params?.requestId;
            if (!requestId || !latestForRequest.has(requestId))
                return;
            const matched = latestForRequest.get(requestId);
            let outcome;
            try {
                const body = await this.client.send("Network.getResponseBody", { requestId }, this.sessionId, signal);
                const raw = body.base64Encoded
                    ? Buffer.from(body.body, "base64").toString("utf8")
                    : body.body;
                try {
                    outcome = { state: "captured", json: JSON.parse(raw), url: matched.url, status: matched.status };
                }
                catch {
                    outcome = { state: "invalid-json" };
                }
            }
            catch {
                outcome = { state: "body-unavailable" };
            }
            settle(outcome);
        });
        cleanupFns.push(unsubLoading);
        if (timeoutMs > 0) {
            timer = setTimeout(() => settle({ state: "timeout" }), timeoutMs);
        }
        if (signal) {
            if (signal.aborted) {
                settle({ state: "aborted" });
            }
            else {
                const onAbort = () => settle({ state: "aborted" });
                signal.addEventListener("abort", onAbort, { once: true });
                cleanupFns.push(() => signal.removeEventListener("abort", onAbort));
            }
        }
        return {
            wait: () => new Promise((resolve) => {
                if (settled)
                    return resolve(settled);
                resolveWait = resolve;
            }),
            cancel: () => settle({ state: "timeout" }),
        };
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        await this.onClose();
    }
}
