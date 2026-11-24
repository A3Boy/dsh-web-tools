import { type NativeBrowserRuntime } from "../browser/index.ts";
import type { SpecializedSource, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome, SourceItem } from "./types.ts";
export declare function parseXMetricNumber(text?: string): number | undefined;
export declare function buildXSearchUrl(query: string, req?: SourceSearchRequest, forceLatest?: boolean): string;
/**
 * Map the public syndication payload (the one X's embed widget uses) to a
 * SourceItem. Free endpoint, no auth, no browser.
 */
export declare function mapSyndicationTweet(json: any, fallbackUrl: string): SourceItem | null;
/**
 * Map the FxTwitter proxy payload to a SourceItem — the standalone fallback
 * when the official syndication endpoint returns nothing.
 */
export declare function mapFxTwitterTweet(tweet: any, fallbackUrl: string): SourceItem | null;
/**
 * Fill missing fields on an item (from the official syndication payload or a
 * browser extraction) with what FxTwitter knows. Strictly additive: a value
 * already present from a first-party source always wins.
 */
export declare function mergeFxTwitterInto(item: SourceItem, tweet: any): void;
type SyndicationFetcher = (tweetId: string, signal?: AbortSignal) => Promise<any | null>;
/** Fetch one tweet from X's public embed endpoint (no auth, no browser). */
export declare function defaultSyndicationFetcher(tweetId: string, signal?: AbortSignal): Promise<any | null>;
/** Test seam: replace the network fetcher (pass a null-returning stub). */
export declare function setSyndicationFetcher(fn: SyndicationFetcher): void;
type FxTwitterFetcher = (tweetId: string, signal?: AbortSignal) => Promise<any | null>;
/**
 * Fetch one tweet from the FxTwitter public proxy API (no auth, no browser).
 *
 * The post https://x.com/vincent_ddup/status/2122917213342720381 popularised
 * this channel for "X intelligence research": one JSON GET returns the full
 * text, the author profile, engagement counts, and media URLs. It is a
 * THIRD-PARTY service — availability is best-effort and every failure here is
 * non-fatal by design; callers must treat null as "channel down".
 */
export declare function defaultFxTwitterFetcher(tweetId: string, signal?: AbortSignal): Promise<any | null>;
/** Test seam: replace the FxTwitter network fetcher (pass a null-returning stub). */
export declare function setFxTwitterFetcher(fn: FxTwitterFetcher): void;
export declare class XSource implements SpecializedSource {
    readonly id: "x";
    readonly name = "Twitter / X";
    private runtime;
    constructor(runtime?: NativeBrowserRuntime);
    status(): Promise<SourceStatus>;
    search(query: string, req?: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    /** One navigation + capture attempt against a concrete search URL. */
    private searchOnce;
    /**
     * Click x.com's inline "Something went wrong → Retry" panel if it is shown.
     *
     * The timeline request is sometimes rejected server-side; the SPA renders a
     * retry button and waits forever for a click. Returns whether one was found.
     */
    private clickXRetryIfPresent;
    fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
    /** Rich fetch: full tweet detail (replies, originals, MP4) through the browser. */
    private fetchViaBrowser;
}
export {};
