import type { SourceItem } from "../types.ts";
import type { XhsRawSearchFeed } from "./types.ts";
export declare function parseXhsMetricNumber(text?: string | number): number | undefined;
export declare function isNoteFeed(feed: XhsRawSearchFeed): boolean;
export declare function normalizeXhsFeed(feed: XhsRawSearchFeed): SourceItem | null;
