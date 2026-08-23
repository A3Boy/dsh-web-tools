export type BrowserPlatform = "xiaohongshu" | "x";
export interface BrowserPlatformStatusView {
    id: BrowserPlatform;
    name: string;
    runtimeAvailable: boolean;
    runtimeState: "unavailable" | "stopped" | "starting" | "ready" | "error";
    browserKind?: "edge" | "chrome";
    authenticated: boolean;
    account?: {
        handle?: string;
        name?: string;
    };
    lastError?: string;
    lastCheckedAt?: number;
}
