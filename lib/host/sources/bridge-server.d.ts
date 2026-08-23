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
import type { BridgeRequest } from "./bridge-protocol.ts";
import type { SourceAccountInfo, SpecializedPlatformId } from "./types.ts";
import type { WebToolsWebServer } from "../context-types.ts";
export declare const BRIDGE_WS_PATH = "/web-tools/bridge/ws";
export interface PairingTicket {
    ticket: string;
    expiresAt: number;
}
export interface BridgeConnectionState {
    connected: boolean;
    extensionVersion?: string;
    paired: boolean;
    connectedAt?: number;
    lastPingAt?: number;
}
export interface PendingCall {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}
export declare class BridgeHostServer {
    private activeWs;
    private pendingTickets;
    private validBridgeKeyHashes;
    private pendingCalls;
    private cachedAccountState;
    private onKeyHashPersist?;
    private activeWss;
    /**
     * Configure persistent storage hook for approved pairing hashes.
     */
    setPersistHook(hook: (hash: string) => void, initialHashes?: string[]): void;
    /**
     * Issue a 60-second one-time bootstrap ticket for the React settings UI.
     * Also cleans up expired tickets to avoid memory accumulation.
     */
    issuePairingTicket(): string;
    /**
     * Validate a pairing ticket or durable bridgeKey during handshake.
     */
    verifyHandshake(ticket?: string, bridgeKey?: string): {
        success: boolean;
        newBridgeKey?: string;
    };
    /**
     * Register WebSocket Upgrade route on DSH webServer with disposer support.
     */
    registerUpgradeRoute(webServer: WebToolsWebServer): () => void;
    /**
     * Register active connection
     */
    attachConnection(ws: any): void;
    /**
     * Remove connection
     */
    detachConnection(ws: any): void;
    /**
     * Check connection status
     */
    isConnected(): boolean;
    /**
     * Get cached account state for platform
     */
    getAccountInfo(platform: SpecializedPlatformId): SourceAccountInfo | undefined;
    /**
     * Set cached account state
     */
    setAccountInfo(platform: SpecializedPlatformId, info: SourceAccountInfo): void;
    /**
     * Handle incoming message from Extension
     */
    handleIncomingMessage(rawMessage: string | Buffer): void;
    /**
     * Send a request to Extension and await correlated response
     */
    sendRequest<T = unknown>(req: BridgeRequest, timeoutMs?: number, signal?: AbortSignal): Promise<T>;
}
/** Global Bridge Host singleton */
export declare const defaultBridgeServer: BridgeHostServer;
