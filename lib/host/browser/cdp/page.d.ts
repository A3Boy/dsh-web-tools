import type { CdpPageLease, JsonCaptureHandle, NetworkCaptureOptions } from "../types.ts";
import { CdpClient } from "./client.ts";
export declare class CdpPage implements CdpPageLease {
    readonly targetId: string;
    readonly sessionId: string;
    private readonly client;
    private readonly onClose;
    constructor(targetId: string, sessionId: string, client: CdpClient, onClose: () => Promise<void>);
    navigate(url: string, signal?: AbortSignal): Promise<void>;
    waitForLoad(signal?: AbortSignal): Promise<void>;
    waitForSelector(selector: string, timeoutMs?: number, signal?: AbortSignal): Promise<void>;
    evaluate<T>(expression: string, signal?: AbortSignal): Promise<T>;
    call<T>(fn: (...args: any[]) => T, args?: unknown[], signal?: AbortSignal): Promise<T>;
    scrollBy(pixels: number, signal?: AbortSignal): Promise<void>;
    /**
     * Install a JSON network capture BEFORE navigation, scoped to THIS page
     * session (flattened sessions on the same browser must never leak into each
     * other). Flow: Network.enable → responseReceived (match url substring) →
     * loadingFinished (same requestId) → Network.getResponseBody → JSON.parse.
     */
    beginJsonCapture(options: NetworkCaptureOptions): Promise<JsonCaptureHandle>;
    close(): Promise<void>;
}
