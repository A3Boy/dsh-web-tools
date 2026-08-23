/**
 * dsh-web-tools — Host Bridge WebSocket Server & Session Manager.
 *
 * Implements:
 * 1. Loopback only WebSocket server at `/web-tools/bridge/ws`.
 * 2. 60-second one-time pairing tickets generated via same-origin UI bootstrap.
 * 3. Durable pairing bridgeKey verification.
 * 4. Request / Response correlation with strict timeout and AbortSignal cancellation.
 *
 * @module
 */
import { randomBytes, createHash } from "node:crypto";
export const BRIDGE_WS_PATH = "/web-tools/bridge/ws";
export class BridgeHostServer {
    activeWs = null;
    pendingTickets = new Map(); // ticket -> expiresAt
    validBridgeKeyHashes = new Set(); // sha256 hashes of approved bridgeKeys
    pendingCalls = new Map(); // requestId -> PendingCall
    cachedAccountState = new Map();
    onKeyHashPersist;
    activeWss = null;
    /**
     * Configure persistent storage hook for approved pairing hashes.
     */
    setPersistHook(hook, initialHashes) {
        this.onKeyHashPersist = hook;
        if (initialHashes) {
            for (const h of initialHashes) {
                if (h && typeof h === "string")
                    this.validBridgeKeyHashes.add(h);
            }
        }
    }
    /**
     * Issue a 60-second one-time bootstrap ticket for the React settings UI.
     * Also cleans up expired tickets to avoid memory accumulation.
     */
    issuePairingTicket() {
        const now = Date.now();
        // Clean expired tickets
        for (const [t, exp] of this.pendingTickets.entries()) {
            if (now > exp)
                this.pendingTickets.delete(t);
        }
        const ticket = randomBytes(16).toString("hex");
        const expiresAt = now + 60000;
        this.pendingTickets.set(ticket, expiresAt);
        return ticket;
    }
    /**
     * Validate a pairing ticket or durable bridgeKey during handshake.
     */
    verifyHandshake(ticket, bridgeKey) {
        const now = Date.now();
        // 1. Check ticket if provided
        if (ticket && this.pendingTickets.has(ticket)) {
            const expiresAt = this.pendingTickets.get(ticket);
            this.pendingTickets.delete(ticket); // one-time use
            if (now <= expiresAt) {
                // Pairing successful! Generate long-term bridgeKey
                const newBridgeKey = randomBytes(24).toString("hex");
                const hash = createHash("sha256").update(newBridgeKey).digest("hex");
                this.validBridgeKeyHashes.add(hash);
                this.onKeyHashPersist?.(hash);
                return { success: true, newBridgeKey };
            }
        }
        // 2. Check durable bridgeKey
        if (bridgeKey) {
            const hash = createHash("sha256").update(bridgeKey).digest("hex");
            if (this.validBridgeKeyHashes.has(hash)) {
                return { success: true };
            }
        }
        return { success: false };
    }
    /**
     * Register WebSocket Upgrade route on DSH webServer with disposer support.
     */
    registerUpgradeRoute(webServer) {
        if (typeof webServer.registerUpgrade !== "function")
            return () => { };
        // Single WebSocketServer instance for the lifetime of this route
        let wssInstance = null;
        // @ts-ignore
        import("ws").then((wsModule) => {
            const WebSocketServer = wsModule?.WebSocketServer || wsModule?.default?.WebSocketServer || wsModule;
            if (WebSocketServer) {
                wssInstance = new WebSocketServer({ noServer: true });
                this.activeWss = wssInstance;
            }
        }).catch(() => { });
        const dispose = webServer.registerUpgrade({
            path: BRIDGE_WS_PATH,
            handler: (req, socket, head) => {
                // Enforce loopback check
                const remote = socket?.remoteAddress ?? req?.socket?.remoteAddress ?? "";
                const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
                if (!isLoopback) {
                    socket.destroy();
                    return;
                }
                const handleWithWss = (wss) => {
                    wss.handleUpgrade(req, socket, head, (ws) => {
                        let isHandshakeComplete = false;
                        const handshakeTimeout = setTimeout(() => {
                            if (!isHandshakeComplete) {
                                try {
                                    ws.close();
                                }
                                catch { }
                            }
                        }, 10000);
                        ws.on("message", (data) => {
                            try {
                                const parsed = JSON.parse(data.toString());
                                if (!isHandshakeComplete) {
                                    if (parsed.kind === "hello") {
                                        const { ticket, bridgeKey } = parsed.payload ?? {};
                                        const verify = this.verifyHandshake(ticket, bridgeKey);
                                        if (verify.success) {
                                            isHandshakeComplete = true;
                                            clearTimeout(handshakeTimeout);
                                            this.attachConnection(ws);
                                            // Send confirmation
                                            ws.send(JSON.stringify({
                                                id: parsed.id,
                                                kind: "result",
                                                payload: {
                                                    paired: true,
                                                    bridgeKey: verify.newBridgeKey,
                                                },
                                            }));
                                        }
                                        else {
                                            ws.send(JSON.stringify({
                                                id: parsed.id,
                                                kind: "error",
                                                error: { code: "AUTH_FAILED", message: "Invalid pairing ticket or bridgeKey" },
                                            }));
                                            ws.close();
                                        }
                                    }
                                    return;
                                }
                                // Normal message processing after handshake
                                this.handleIncomingMessage(data);
                            }
                            catch {
                                // Ignore malformed frame
                            }
                        });
                        ws.on("close", () => {
                            clearTimeout(handshakeTimeout);
                            this.detachConnection(ws);
                        });
                        ws.on("error", () => {
                            clearTimeout(handshakeTimeout);
                            this.detachConnection(ws);
                        });
                    });
                };
                if (wssInstance) {
                    handleWithWss(wssInstance);
                }
                else {
                    // @ts-ignore
                    import("ws").then((wsModule) => {
                        const WebSocketServer = wsModule?.WebSocketServer || wsModule?.default?.WebSocketServer || wsModule;
                        wssInstance = new WebSocketServer({ noServer: true });
                        this.activeWss = wssInstance;
                        handleWithWss(wssInstance);
                    }).catch(() => {
                        socket.destroy();
                    });
                }
            },
        });
        return () => {
            if (typeof dispose === "function")
                dispose();
            if (this.activeWs) {
                try {
                    this.activeWs.close();
                }
                catch { }
                this.activeWs = null;
            }
            if (wssInstance) {
                try {
                    wssInstance.close();
                }
                catch { }
                wssInstance = null;
            }
            this.activeWss = null;
        };
    }
    /**
     * Register active connection
     */
    attachConnection(ws) {
        if (this.activeWs && this.activeWs !== ws) {
            try {
                this.activeWs.close();
            }
            catch {
                // Ignore
            }
        }
        this.activeWs = ws;
    }
    /**
     * Remove connection
     */
    detachConnection(ws) {
        if (this.activeWs === ws) {
            this.activeWs = null;
            // Reject any in-flight pending calls
            for (const [id, pending] of this.pendingCalls.entries()) {
                clearTimeout(pending.timer);
                pending.reject(new Error("Bridge connection closed"));
            }
            this.pendingCalls.clear();
        }
    }
    /**
     * Check connection status
     */
    isConnected() {
        return this.activeWs !== null;
    }
    /**
     * Get cached account state for platform
     */
    getAccountInfo(platform) {
        return this.cachedAccountState.get(platform);
    }
    /**
     * Set cached account state
     */
    setAccountInfo(platform, info) {
        this.cachedAccountState.set(platform, info);
    }
    /**
     * Handle incoming message from Extension
     */
    handleIncomingMessage(rawMessage) {
        try {
            const msg = JSON.parse(rawMessage.toString());
            if (msg.kind === "auth.changed" && msg.payload) {
                const payload = msg.payload;
                if (payload.platform) {
                    if (payload.authenticated) {
                        this.setAccountInfo(payload.platform, {
                            accountId: payload.accountId,
                            accountLabel: payload.accountLabel,
                            avatarUrl: payload.avatarUrl,
                            verifiedAt: Date.now(),
                        });
                    }
                    else {
                        this.cachedAccountState.delete(payload.platform);
                    }
                }
                return;
            }
            const pending = this.pendingCalls.get(msg.id);
            if (pending) {
                clearTimeout(pending.timer);
                this.pendingCalls.delete(msg.id);
                if (msg.kind === "error" || msg.error) {
                    pending.reject(new Error(msg.error?.message ?? "Bridge error"));
                }
                else {
                    pending.resolve(msg.payload);
                }
            }
        }
        catch {
            // Malformed message
        }
    }
    /**
     * Send a request to Extension and await correlated response
     */
    async sendRequest(req, timeoutMs = 20000, signal) {
        if (!this.activeWs) {
            throw new Error("Browser Bridge is not connected");
        }
        if (signal?.aborted) {
            throw new Error("Request aborted by caller");
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingCalls.delete(req.id);
                reject(new Error(`Bridge request timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            const onAbort = () => {
                clearTimeout(timer);
                this.pendingCalls.delete(req.id);
                // Send cancel command to extension
                try {
                    this.activeWs?.send(JSON.stringify({ id: req.id, kind: "cancel" }));
                }
                catch {
                    // Ignore
                }
                reject(new Error("Request aborted by caller"));
            };
            if (signal) {
                signal.addEventListener("abort", onAbort, { once: true });
            }
            this.pendingCalls.set(req.id, {
                resolve: (val) => {
                    if (signal)
                        signal.removeEventListener("abort", onAbort);
                    resolve(val);
                },
                reject: (err) => {
                    if (signal)
                        signal.removeEventListener("abort", onAbort);
                    reject(err);
                },
                timer,
            });
            try {
                this.activeWs.send(JSON.stringify(req));
            }
            catch (err) {
                clearTimeout(timer);
                this.pendingCalls.delete(req.id);
                if (signal)
                    signal.removeEventListener("abort", onAbort);
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
    }
}
/** Global Bridge Host singleton */
export const defaultBridgeServer = new BridgeHostServer();
