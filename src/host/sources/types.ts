export type SpecializedPlatformId = "xiaohongshu" | "x";

export type SourceErrorCode =
  | "runtime-unavailable"
  | "auth-required"
  | "auth-expired"
  | "login-timeout"
  | "browser-launch-failed"
  | "browser-crashed"
  | "navigation-timeout"
  | "search-restricted"
  | "blocked"
  | "parse-failed"
  | "network"
  | "aborted"
  | "unknown";

export interface SourceFailure {
  code: SourceErrorCode;
  message: string;
  retryable: boolean;
}

export interface SourceAccountInfo {
  handle?: string;
  name?: string;
  url?: string;
  avatarUrl?: string;
}

export interface SourceCapabilities {
  nativeSearch: boolean;
  nativeFetch: boolean;
  webSearchFallback: boolean;
}

export interface SourceStatus {
  id: SpecializedPlatformId;
  name: string;
  enabled: boolean;
  runtimeAvailable: boolean;
  runtimeState:
    | "unavailable"
    | "stopped"
    | "starting"
    | "ready"
    | "error";
  authenticated: boolean;
  sessionEstablished?: boolean;
  capabilities?: SourceCapabilities;
  account?: SourceAccountInfo;
  lastError?: string;
  lastCheckedAt?: number;
}

export interface SourceSearchRequest {
  maxResults?: number;
  hints?: import("../search-hints.ts").SearchHints;
}

export interface SourceComment {
  id: string;
  text: string;
  author?: SourceAccountInfo;
  publishedAt?: string;
  likes?: number;
  parentId?: string;
  url?: string;
}

export interface SourceItem {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  text?: string;
  author?: SourceAccountInfo;
  publishedAt?: string;
  likes?: number;
  collects?: number;
  retweets?: number;
  replies?: number;
  comments?: SourceComment[];
  commentsTruncated?: boolean;
  images?: string[];
  coverImage?: string;
  platform: SpecializedPlatformId | "general";
}

export interface SourceSearchOutcome {
  items: SourceItem[];
  error?: SourceFailure;
  retrievalMode?: "native-browser" | "degraded-web" | "general-web";
  /**
   * Set when the answer did NOT come from the platform itself (native search
   * unavailable) and a site:-filtered web search was used instead. Callers must
   * surface this: silently labelling web results as platform results is the
   * failure mode this field exists to prevent.
   */
  degraded?: SourceDegradation;
  /** Which provider(s) served a general-web fallback (`a+b` when fused). */
  backend?: string;
  /** Per-provider attempt ledger of a general-web fallback. */
  attempts?: Array<{ provider: string; outcome: string; latencyMs?: number }>;
  /** True when the fallback merged two providers with RRF. */
  fused?: boolean;
}

/** Why a platform search was served by a web-search fallback instead. */
export interface SourceDegradation {
  code: SourceErrorCode | "platform-disabled";
  message: string;
  /** `xiaohongshu` / `x`, when the degradation came from a platform source. */
  platform?: SpecializedPlatformId;
}

export interface SourceFetchOutcome {
  item?: SourceItem;
  error?: SourceFailure;
  retrievalMode?: "native-browser" | "degraded-web" | "general-web";
}

export interface SpecializedSource {
  readonly id: SpecializedPlatformId;
  readonly name: string;
  status(): Promise<SourceStatus>;
  search(
    query: string,
    req?: SourceSearchRequest,
    signal?: AbortSignal,
  ): Promise<SourceSearchOutcome>;
  fetch(
    url: string,
    signal?: AbortSignal,
  ): Promise<SourceFetchOutcome>;
}
