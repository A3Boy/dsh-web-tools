/**
 * dsh-web-tools — social post data models and parser.
 *
 * Pure data transformation functions that parse search result text into
 * structured post previews with covers, metrics, and author details.
 * Kept separate from UI components so it remains 100% testable in Node.
 * @module
 */
export interface PlatformInfo {
    label: string;
    color: string;
}
export declare const PLATFORMS: Record<string, PlatformInfo>;
export interface PostPreview {
    title: string;
    url: string;
    platform: PlatformInfo;
    author?: string;
    summary: string;
    publishedAt?: string;
    likes?: number;
    collects?: number;
    retweets?: number;
    replies?: number;
    cover?: string;
}
export declare function platformOf(url: string): PlatformInfo | undefined;
export declare function compactNumber(raw: string | undefined): number | undefined;
export declare function shortCount(value: number | undefined): string | undefined;
/** `昨天` / `3 天前` / `2026-09-18` from a YYYY-MM-DD[THH:mm:ss] stamp. */
export declare function relativeDate(raw: string | undefined): string | undefined;
export declare function parseSnippetMetrics(head: string): {
    author: string | undefined;
    likes: number | undefined;
    collects: number | undefined;
    retweets: number | undefined;
    replies: number | undefined;
};
/**
 * Parse search outcome into structured post previews.
 */
export declare function parseSearchResult(text: string, structuredSources?: any[]): {
    posts: PostPreview[];
    raw: string;
};
