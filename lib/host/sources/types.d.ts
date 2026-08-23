/**
 * dsh-web-tools — Specialized Platform Source Types & Contracts.
 *
 * Specialized sources represent authenticated browser-based platform searchers
 * (e.g. Xiaohongshu, Twitter/X) distinct from general multi-tenant search engines.
 *
 * Core principles:
 * 1. Zero raw cookie storage on Host / React (Browser Session is sole authority).
 * 2. Transparent integration behind DSH standard web_search / web_fetch.
 * 3. Graceful degradation to general web fallback when disconnected or requested.
 *
 * @module
 */
import type { Source } from "../providers/types.ts";
import type { SearchHints } from "../search-hints.ts";
export type SpecializedPlatformId = "xiaohongshu" | "x";
export type RetrievalMode = "native-browser" | "native-fast-path" | "degraded-web";
export interface SourceAccountInfo {
    accountId?: string;
    accountLabel?: string;
    avatarUrl?: string;
    verifiedAt?: number;
}
export interface SourceStatus {
    id: SpecializedPlatformId;
    enabled: boolean;
    bridgeConnected: boolean;
    authenticated: boolean;
    account?: SourceAccountInfo;
    lastError?: string;
    lastCheckedAt?: number;
}
export interface SourceSearchRequest {
    query: string;
    maxResults?: number;
    hints?: Readonly<SearchHints>;
}
export interface SourceSearchOutcome {
    id: SpecializedPlatformId;
    mode: RetrievalMode;
    sources: Source[];
    latencyMs: number;
    accountLabel?: string;
    diagnostics?: Record<string, unknown>;
    error?: string;
}
export interface SourceFetchOutcome {
    id: SpecializedPlatformId;
    mode: RetrievalMode;
    url: string;
    title?: string;
    text?: string;
    author?: string;
    publishedAt?: string;
    metrics?: {
        likes?: number;
        shares?: number;
        replies?: number;
        collects?: number;
    };
    latencyMs: number;
    error?: string;
}
/**
 * Common contract implemented by each specialized platform source (XHS, X).
 */
export interface SpecializedSource {
    readonly id: SpecializedPlatformId;
    /** Probe the connection and authentication state with the browser bridge */
    probe(): Promise<SourceStatus>;
    /** Execute a structured platform search */
    search(request: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    /** Execute a structured platform page / note / tweet extraction */
    fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
}
