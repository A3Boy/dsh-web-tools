export type BrowserPlatform = "xiaohongshu" | "x";

export interface PlatformAccountView {
  handle?: string;
  name?: string;
  url?: string;
  avatarUrl?: string;
}

export interface PlatformCapabilitiesView {
  nativeSearch: boolean;
  nativeFetch: boolean;
  webSearchFallback: boolean;
}

export interface BrowserPlatformStatusView {
  id: BrowserPlatform;
  name: string;
  enabled: boolean;
  runtimeAvailable: boolean;
  runtimeState: "unavailable" | "stopped" | "starting" | "ready" | "error";
  browserKind?: "edge" | "chrome";
  authenticated: boolean;
  sessionEstablished?: boolean;
  capabilities?: PlatformCapabilitiesView;
  account?: PlatformAccountView;
  lastError?: string;
  lastCheckedAt?: number;
}

export interface PlatformStatusResponse {
  platforms: Record<BrowserPlatform, BrowserPlatformStatusView>;
}

export interface PlatformActionResponse {
  ok?: boolean;
  status?: string;
}
