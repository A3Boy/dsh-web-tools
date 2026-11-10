import type { SourceItem } from "../types.ts";
import type { XhsRawSearchFeed } from "./types.ts";
export declare function parseXhsMetricNumber(text?: string | number): number | undefined;
export declare function isNoteFeed(feed: XhsRawSearchFeed): boolean;
/** First non-empty line, whitespace-collapsed and truncated. */
export declare function firstLine(text: string | undefined, max?: number): string;
export declare function normalizeXhsFeed(feed: XhsRawSearchFeed): SourceItem | null;
