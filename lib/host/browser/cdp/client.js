import { WebSocket } from "ws";
import { CdpError } from "./errors.js";
export class CdpClient {
    ws;
    nextId = 1;
    pending = new Map();
    eventListeners = new Map();
    closed = false;
    constructor(wsUrl) {
        if (typeof wsUrl === "string") {
            this.ws = new WebSocket(wsUrl);
            this.setupSocketHandlers();
        }
        else {
            this.ws = wsUrl;
            this.setupSocketHandlers();
        }
    }
    isClosed() {
        return this.closed || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING;
    }
    pendingCount() {
        return this.pending.size;
    }
    async connect(timeoutMs = 10000) {
        if (this.ws.readyState === WebSocket.OPEN)
            return;
        return new Promise((resolve, reject) => {
            let settled = false;
            let timer;
            const cleanup = () => {
                if (timer)
                    clearTimeout(timer);
                this.ws.removeListener("open", onOpen);
                this.ws.removeListener("error", onError);
                this.ws.removeListener("close", onClose);
            };
            const onOpen = () => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                resolve();
            };
            const onError = (err) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                this.close();
                reject(err);
            };
            const onClose = () => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                this.close();
                reject(new Error(`WebSocket closed before open: ${this.ws.url}`));
            };
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    if (settled)
                        return;
                    settled = true;
                    cleanup();
                    this.close();
                    reject(new Error(`WebSocket connection timeout to ${this.ws.url}`));
                }, timeoutMs);
            }
            this.ws.once("open", onOpen);
            this.ws.once("error", onError);
            this.ws.once("close", onClose);
        });
    }
    setupSocketHandlers() {
        this.ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString("utf8"));
                if (msg.id !== undefined && this.pending.has(msg.id)) {
                    const req = this.pending.get(msg.id);
                    if (req.settled)
                        return;
                    req.settled = true;
                    this.pending.delete(msg.id);
                    if (req.timer)
                        clearTimeout(req.timer);
                    if (req.signal && req.onAbort) {
                        req.signal.removeEventListener("abort", req.onAbort);
                    }
                    if (msg.error) {
                        req.reject(new CdpError(msg.error.code, msg.error.message));
                    }
                    else {
                        req.resolve(msg.result);
                    }
                }
                else if (msg.method) {
                    const listeners = this.eventListeners.get(msg.method);
                    if (listeners) {
                        for (const listener of listeners) {
                            try {
                                listener(msg.params, msg.sessionId);
                            }
                            catch {
                                // Ignore listener exceptions
                            }
                        }
                    }
                }
            }
            catch {
                // Ignore unparseable message
            }
        });
        this.ws.on("close", () => {
            this.closed = true;
            for (const [id, req] of Array.from(this.pending.entries())) {
                this.pending.delete(id);
                if (req.settled)
                    continue;
                req.settled = true;
                if (req.timer)
                    clearTimeout(req.timer);
                if (req.signal && req.onAbort) {
                    req.signal.removeEventListener("abort", req.onAbort);
                }
                req.reject(new Error("CDP WebSocket connection closed"));
            }
            this.pending.clear();
            const closeListeners = this.eventListeners.get("__cdp_close__");
            if (closeListeners) {
                for (const l of closeListeners) {
                    try {
                        l({});
                    }
                    catch { }
                }
            }
        });
        this.ws.on("error", () => {
            // WS error will trigger close or command failure
        });
    }
    send(method, params = {}, sessionId, signal, timeoutMs = 15000) {
        if (this.closed || this.ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error("CDP WebSocket is not open"));
        }
        if (signal?.aborted) {
            return Promise.reject(new Error("CDP command aborted"));
        }
        return new Promise((resolve, reject) => {
            const id = this.nextId++;
            let settled = false;
            let timer;
            let onAbort;
            const cleanup = () => {
                if (timer)
                    clearTimeout(timer);
                if (signal && onAbort) {
                    signal.removeEventListener("abort", onAbort);
                }
                this.pending.delete(id);
            };
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    if (settled)
                        return;
                    settled = true;
                    cleanup();
                    reject(new Error(`CDP command ${method} (id=${id}) timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            }
            if (signal) {
                onAbort = () => {
                    if (settled)
                        return;
                    settled = true;
                    cleanup();
                    reject(new Error("CDP command aborted"));
                };
                signal.addEventListener("abort", onAbort, { once: true });
            }
            this.pending.set(id, {
                resolve: (val) => {
                    if (settled)
                        return;
                    settled = true;
                    cleanup();
                    resolve(val);
                },
                reject: (err) => {
                    if (settled)
                        return;
                    settled = true;
                    cleanup();
                    reject(err);
                },
                timer,
                onAbort,
                signal,
            });
            const payload = { id, method, params };
            if (sessionId) {
                payload.sessionId = sessionId;
            }
            this.ws.send(JSON.stringify(payload), (err) => {
                if (err) {
                    if (settled)
                        return;
                    settled = true;
                    cleanup();
                    reject(err);
                }
            });
        });
    }
    on(eventName, listener) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, new Set());
        }
        this.eventListeners.get(eventName).add(listener);
        return () => {
            const set = this.eventListeners.get(eventName);
            if (set) {
                set.delete(listener);
                if (set.size === 0)
                    this.eventListeners.delete(eventName);
            }
        };
    }
    onClose(listener) {
        return this.on("__cdp_close__", listener);
    }
    close() {
        this.closed = true;
        try {
            this.ws.close();
        }
        catch {
            // Ignore close errors
        }
    }
}
