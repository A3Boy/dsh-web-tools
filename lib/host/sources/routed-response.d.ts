/**
 * dsh-web-tools — response formatting & degradation explanations for routed sources.
 *
 * Lightweight standalone module decoupled from the Cordis host plugin entrypoint,
 * allowing both DSH Host plugin and standalone MCP Server to reuse it cleanly.
 *
 * @module
 */
import type { SourceItem, SourceFetchOutcome, SourceDegradation, SourceSearchOutcome } from "./types.ts";
import { type WebFetchResponse } from "../registry.ts";
export declare function toRoutedFetchResponse(url: string, outcome: SourceFetchOutcome): WebFetchResponse;
export declare function formatUnavailablePlatformResponse(url: string, platform: string, errorCode: string | undefined, detail: string): WebFetchResponse;
export declare function executeRoutedFetchWithRecovery(url: string, fetchFn: () => Promise<SourceFetchOutcome>, recoveryContext?: {
    lookupCache?: (url: string) => SourceItem | undefined;
    searchFallback?: (url: string) => Promise<string | undefined>;
}): Promise<WebFetchResponse>;
/**
 * One-line, model-facing explanation of a degraded platform search.
 * When target is "mcp", provides the CLI login command rather than pointing to DSH settings.
 */
export declare function describeDegradation(d: SourceDegradation, target?: "dsh" | "mcp"): string;
/**
 * Format concise, single-line snippet (≤200 code points) for UI card display.
 */
export declare function formatPlatformSnippet(item: SourceItem): string;
/**
 * Format full rich digest (≤800 code points) for model-facing summary in DSH tool-web / MCP.
 */
export declare function formatPlatformDigest(item: SourceItem): string;
export interface RoutedSearchResponseOptions {
    target?: "dsh" | "mcp";
}
/**
 * Maps a SourceSearchOutcome into the normalized WebSearchResult shape,
 * preserving top-level content, degradation notices, publishedAt, snippet, and summary.
 */
export declare function toRoutedSearchResponse(outcome: SourceSearchOutcome, options?: RoutedSearchResponseOptions): {
    fused?: boolean | undefined;
    attempts?: {
        provider: string;
        outcome: string;
        latencyMs?: number;
    }[] | undefined;
    backend?: string | undefined;
    sources: {
        publishedAt?: string | undefined;
        summary?: string | undefined;
        url: string;
        title: string;
        snippet: string;
    }[];
    truncated: boolean;
    diagnostics?: string[] | undefined;
    degraded?: SourceDegradation | undefined;
    content?: string | undefined;
};
