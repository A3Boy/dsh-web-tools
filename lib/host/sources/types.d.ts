export type SpecializedPlatformId = "xiaohongshu" | "x";
export type SourceErrorCode = "runtime-unavailable" | "auth-required" | "auth-expired" | "login-timeout" | "browser-launch-failed" | "browser-crashed" | "navigation-timeout" | "blocked" | "parse-failed" | "network" | "aborted" | "unknown";
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
    runtimeState: "unavailable" | "stopped" | "starting" | "ready" | "error";
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
    images?: string[];
    coverImage?: string;
    platform: SpecializedPlatformId | "general";
}
export interface SourceSearchOutcome {
    items: SourceItem[];
    error?: SourceFailure;
    retrievalMode?: "native-browser" | "degraded-web" | "general-web";
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
    search(query: string, req?: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
}
