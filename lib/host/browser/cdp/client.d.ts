import { WebSocket } from "ws";
export declare class CdpClient {
    private ws;
    private nextId;
    private pending;
    private eventListeners;
    private closed;
    constructor(wsUrl: string | WebSocket);
    isClosed(): boolean;
    pendingCount(): number;
    connect(timeoutMs?: number): Promise<void>;
    private setupSocketHandlers;
    send<T = any>(method: string, params?: Record<string, unknown>, sessionId?: string, signal?: AbortSignal, timeoutMs?: number): Promise<T>;
    on(eventName: string, listener: (params: any, sessionId?: string) => void): () => void;
    onClose(listener: () => void): () => void;
    close(): void;
}
