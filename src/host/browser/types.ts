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
  mode: BrowserRunMode;
  startedAt: number;
}

/** Outcome of a JSON network capture. Distinguished states so callers can tell
 *  "graphql returned 0 items" (captured) apart from "we never saw the request"
 *  (timeout / body-unavailable / invalid-json). */
export type NetworkCaptureOutcome =
  | { state: "captured"; json: unknown; url: string; status: number }
  | { state: "timeout" }
  | { state: "aborted" }
  | { state: "body-unavailable" }
  | { state: "invalid-json" };

export interface NetworkCaptureOptions {
  /** Substring that must appear in the response URL (e.g. "/SearchTimeline"). */
  urlIncludes: string;
  /** How long to keep listening for the response before resolving `timeout`. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface JsonCaptureHandle {
  /** Resolves with the first matching captured response, or a non-captured state. */
  wait(): Promise<NetworkCaptureOutcome>;
  /** Stop listening and release listeners early. */
  cancel(): void;
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
  /**
   * Start listening for a JSON network response BEFORE navigation happens.
   * Installs Network.enable + session-scoped listeners, returns a handle whose
   * wait() resolves with the first matching response body (or a failure state).
   */
  beginJsonCapture(options: NetworkCaptureOptions): Promise<JsonCaptureHandle>;
  close(): Promise<void>;
}

export interface NativeBrowserRuntime {
  detect(): Promise<BrowserInfo | null>;
  status(platform: BrowserPlatform): Promise<BrowserSessionStatus>;
  login(platform: BrowserPlatform, signal?: AbortSignal): Promise<BrowserSessionStatus>;
  checkAuthentication(platform: BrowserPlatform): Promise<boolean>;
  verifyAuthenticationForOperation(
    platform: BrowserPlatform,
    signal?: AbortSignal,
    mode?: BrowserRunMode,
  ): Promise<boolean>;
  openPage(
    platform: BrowserPlatform,
    url: string,
    signal?: AbortSignal,
    mode?: BrowserRunMode,
  ): Promise<CdpPageLease>;
  /** Create a blank (about:blank) attached page WITHOUT navigating. Lets callers
   *  install network capture listeners before triggering navigation. */
  createPage(
    platform: BrowserPlatform,
    signal?: AbortSignal,
    mode?: BrowserRunMode,
  ): Promise<CdpPageLease>;
  resetSession(platform: BrowserPlatform): Promise<void>;
  stop(platform: BrowserPlatform): Promise<void>;
  dispose(): Promise<void>;
}
