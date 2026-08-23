export type BrowserPlatform = "xiaohongshu" | "x";

export interface BrowserInfo {
  kind: "edge" | "chrome";
  executablePath: string;
  version?: string;
}

export type BrowserRuntimeState =
  | "unavailable"
  | "stopped"
  | "starting"
  | "ready"
  | "error";

export type PlatformAuthState =
  | "unknown"
  | "signed-out"
  | "login-pending"
  | "authenticated"
  | "expired";

export type BrowserRunMode = "headless" | "interactive";

export interface BrowserSessionStatus {
  platform: BrowserPlatform;
  runtimeAvailable: boolean;
  runtimeState: BrowserRuntimeState;
  browser?: BrowserInfo;
  mode?: BrowserRunMode;
  authState: PlatformAuthState;
  authenticated: boolean;
  /** Whether a dedicated profile session was previously established (non-secret metadata, unverified at cold start). */
  sessionEstablished?: boolean;
  accountLabel?: string;
  verifiedAt?: number;
  lastError?: string;
}

export interface RunningBrowserState {
  pid: number;
  port: number;
  browserKind: "edge" | "chrome";
  profileDir: string;
  startedAt: number;
}

export interface CdpPageLease {
  targetId: string;
  sessionId: string;
  navigate(url: string, signal?: AbortSignal): Promise<void>;
  waitForSelector(selector: string, timeoutMs?: number, signal?: AbortSignal): Promise<void>;
  waitForLoad(signal?: AbortSignal): Promise<void>;
  evaluate<T>(expression: string, signal?: AbortSignal): Promise<T>;
  call<T>(fn: (...args: any[]) => T, args?: unknown[], signal?: AbortSignal): Promise<T>;
  scrollBy(pixels: number, signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export interface NativeBrowserRuntime {
  detect(): Promise<BrowserInfo | null>;
  status(platform: BrowserPlatform): Promise<BrowserSessionStatus>;
  login(platform: BrowserPlatform, signal?: AbortSignal): Promise<BrowserSessionStatus>;
  checkAuthentication(platform: BrowserPlatform): Promise<boolean>;
  verifyAuthenticationForOperation(platform: BrowserPlatform, signal?: AbortSignal): Promise<boolean>;
  openPage(platform: BrowserPlatform, url: string, signal?: AbortSignal): Promise<CdpPageLease>;
  resetSession(platform: BrowserPlatform): Promise<void>;
  stop(platform: BrowserPlatform): Promise<void>;
  dispose(): Promise<void>;
}
