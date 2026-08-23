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
    async connect(timeoutMs = 10000) {
        if (this.ws.readyState === WebSocket.OPEN)
            return;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`WebSocket connection timeout to ${this.ws.url}`));
            }, timeoutMs);
            const onOpen = () => {
                clearTimeout(timer);
                this.ws.removeListener("error", onError);
                resolve();
            };
            const onError = (err) => {
                clearTimeout(timer);
                this.ws.removeListener("open", onOpen);
                reject(err);
            };
            this.ws.once("open", onOpen);
            this.ws.once("error", onError);
        });
    }
    setupSocketHandlers() {
        this.ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString("utf8"));
                if (msg.id !== undefined && this.pending.has(msg.id)) {
                    const req = this.pending.get(msg.id);
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
            for (const [id, req] of this.pending.entries()) {
                if (req.timer)
                    clearTimeout(req.timer);
                if (req.signal && req.onAbort) {
                    req.signal.removeEventListener("abort", req.onAbort);
                }
                req.reject(new Error("CDP WebSocket connection closed"));
            }
            this.pending.clear();
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
            let timer;
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    this.pending.delete(id);
                    reject(new Error(`CDP command ${method} (id=${id}) timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            }
            let onAbort;
            if (signal) {
                onAbort = () => {
                    if (timer)
                        clearTimeout(timer);
                    this.pending.delete(id);
                    reject(new Error("CDP command aborted"));
                };
                signal.addEventListener("abort", onAbort, { once: true });
            }
            this.pending.set(id, { resolve, reject, timer, onAbort, signal });
            const payload = { id, method, params };
            if (sessionId) {
                payload.sessionId = sessionId;
            }
            this.ws.send(JSON.stringify(payload), (err) => {
                if (err) {
                    if (timer)
                        clearTimeout(timer);
                    if (signal && onAbort)
                        signal.removeEventListener("abort", onAbort);
                    this.pending.delete(id);
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
