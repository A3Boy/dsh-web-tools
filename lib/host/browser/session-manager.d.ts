import type { BrowserInfo, BrowserPlatform, BrowserSessionStatus, CdpPageLease, NativeBrowserRuntime } from "./types.ts";
export declare class SessionManager implements NativeBrowserRuntime {
    private sessions;
    private startingPromises;
    private profileStore;
    private stateStore;
    private readonly browserChoice;
    private readonly idleShutdownMs;
    constructor(browserChoice?: "auto" | "edge" | "chrome" | string, baseDirOverride?: string, idleShutdownMs?: number);
    detect(): Promise<BrowserInfo | null>;
    checkAuthentication(platform: BrowserPlatform): Promise<boolean>;
    verifyAuthenticationForOperation(platform: BrowserPlatform, signal?: AbortSignal): Promise<boolean>;
    private internalCheckAuth;
    status(platform: BrowserPlatform): Promise<BrowserSessionStatus>;
    login(platform: BrowserPlatform, signal?: AbortSignal): Promise<BrowserSessionStatus>;
    private prepareInteractiveLogin;
    openPage(platform: BrowserPlatform, url: string, signal?: AbortSignal): Promise<CdpPageLease>;
    /**
     * Create a blank (about:blank) attached page WITHOUT navigating. This is the
     * only way to install network capture listeners before the platform SPA
     * fires its API requests (e.g. X SearchTimeline fires immediately on boot).
     */
    createPage(platform: BrowserPlatform, signal?: AbortSignal): Promise<CdpPageLease>;
    private ensureSession;
    private resetIdleTimer;
    resetSession(platform: BrowserPlatform): Promise<void>;
    stop(platform: BrowserPlatform): Promise<void>;
    dispose(): Promise<void>;
}
