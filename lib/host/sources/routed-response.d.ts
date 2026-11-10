/**
 * dsh-web-tools — response formatting & degradation explanations for routed sources.
 *
 * Lightweight standalone module decoupled from the Cordis host plugin entrypoint,
 * allowing both DSH Host plugin and standalone MCP Server to reuse it cleanly.
 *
 * @module
 */
import type { SourceItem, SourceFetchOutcome, SourceDegradation } from "./types.ts";
import { type WebFetchResponse } from "../registry.ts";
export declare function toRoutedFetchResponse(url: string, outcome: SourceFetchOutcome): WebFetchResponse;
/**
 * One-line, model-facing explanation of a degraded platform search.
 */
export declare function describeDegradation(d: SourceDegradation): string;
/**
 * Format rich author, metrics, and snippet text for a platform item.
 */
export declare function formatPlatformSnippet(item: SourceItem): string;
