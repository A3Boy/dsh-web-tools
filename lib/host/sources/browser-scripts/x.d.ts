export interface XTweetExtraction {
    id: string;
    url: string;
    text: string;
    authorName?: string;
    authorHandle?: string;
    publishedAt?: string;
    likes?: number;
    retweets?: number;
    replies?: number;
    views?: number;
    mediaUrls?: string[];
}
export declare function extractVisibleXTweets(): XTweetExtraction[];
