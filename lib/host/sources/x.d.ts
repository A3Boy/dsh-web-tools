import { type NativeBrowserRuntime } from "../browser/index.ts";
import type { SpecializedSource, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome, SourceItem } from "./types.ts";
export declare function parseXMetricNumber(text?: string): number | undefined;
export declare function buildXSearchUrl(query: string, req?: SourceSearchRequest, forceLatest?: boolean): string;
/**
 * Map the public syndication payload (the one X's embed widget uses) to a
 * SourceItem. Free endpoint, no auth, no browser.
 */
export declare function mapSyndicationTweet(json: any, fallbackUrl: string): SourceItem | null;
type SyndicationFetcher = (tweetId: string, signal?: AbortSignal) => Promise<any | null>;
/** Test seam: replace the network fetcher (pass a null-returning stub). */
export declare function setSyndicationFetcher(fn: SyndicationFetcher): void;
export declare class XSource implements SpecializedSource {
    readonly id: "x";
    readonly name = "Twitter / X";
    private runtime;
    constructor(runtime?: NativeBrowserRuntime);
    status(): Promise<SourceStatus>;
    search(query: string, req?: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    /** One navigation + capture attempt against a concrete search URL. */
    private searchOnce;
    fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
}
export {};
