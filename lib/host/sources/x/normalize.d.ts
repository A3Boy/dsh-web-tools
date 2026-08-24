import type { SourceItem } from "../types.ts";
import type { XSearchTimelineResponse, XTweetDetailResponse, XTweetResult } from "./types.ts";
/** Extract the numeric status / tweet ID from a tweet URL. */
export declare function extractTweetIdFromUrl(url: string): string | undefined;
/** Recognize the SearchTimeline envelope shape (lenient: missing pieces are ok). */
export declare function isSearchTimelineResponse(value: unknown): value is XSearchTimelineResponse;
/** Recognize the TweetDetail envelope shape. */
export declare function isTweetDetailResponse(value: unknown): value is XTweetDetailResponse;
/** Unwrap visibility wrapper; skips tombstones / unavailable / unknown types. */
export declare function unwrapTweetResult(result: XTweetResult | undefined): XTweetResult | undefined;
/** Parse legacy X date token "Mon Aug 24 02:22:42 +0000 2026" to RFC3339. */
export declare function parseXDateToken(createdAt?: string): string | undefined;
/** Expand t.co short links in the tweet text using entities.urls[].expanded_url. */
export declare function expandTweetUrls(text: string, urls?: Array<{
    url?: string;
    expanded_url?: string;
}>): string;
/** Map a raw tweet result to a canonical SourceItem (PRIMARY GraphQL path). */
export declare function normalizeTweet(tweet: XTweetResult): SourceItem | undefined;
/**
 * PRIMARY X search extraction: iterate ONLY top-level timeline entries of the
 * add/pin/replace instructions and normalize their tweet_results. Ignores
 * quoted/retweeted inner tweets, conversations, cursors, and promoted noise.
 */
export declare function extractTweetsFromSearchTimeline(value: unknown): SourceItem[];
/**
 * PRIMARY X fetch extraction: locate the EXACT focal tweet matching targetTweetId
 * from a TweetDetail GraphQL response. Checks both direct TimelineTimelineItem
 * entries and conversation thread module items, unwrapping visibility results.
 */
export declare function extractTweetFromTweetDetail(value: unknown, targetTweetId: string): SourceItem | undefined;
