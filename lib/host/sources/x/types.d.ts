/**
 * X / Twitter GraphQL raw wire types for the CDP Network Capture path.
 *
 * IMPORTANT: these reflect the REAL schema captured from a live SearchTimeline
 * response (test/fixtures/x-searchtimeline.json), not a hand-guessed mock.
 * Key modernizations vs legacy Twitter API:
 *  - timeline instructions carry `type` (not `__typename`): "TimelineAddEntries"
 *  - user identity lives at core.user_results.result.core.{name,screen_name}
 *    (the legacy `legacy` block on user results is gone)
 *  - long-form tweets prefer note_tweet.note_tweet_results.result.text
 */
export interface XSearchTimelineResponse {
    data?: {
        search_by_raw_query?: {
            search_timeline?: {
                timeline?: {
                    instructions?: XTimelineInstruction[];
                    responseObjects?: unknown;
                };
            };
        };
    };
    errors?: Array<{
        message: string;
        code?: number;
    }>;
}
export interface XTweetDetailResponse {
    data?: {
        threaded_conversation_with_injections_v2?: {
            instructions?: XTimelineInstruction[];
        };
    };
    errors?: Array<{
        message: string;
        code?: number;
    }>;
}
export interface XTimelineInstruction {
    /** e.g. "TimelineAddEntries" | "TimelinePinEntry" | "TimelineReplaceEntry" | "TimelineClearCache" */
    type?: string;
    __typename?: string;
    entries?: XTimelineEntry[];
}
export interface XTimelineEntry {
    entryId?: string;
    sortIndex?: string;
    content?: {
        __typename?: string;
        entryType?: string;
        itemContent?: {
            __typename?: string;
            itemType?: string;
            tweetDisplayType?: string;
            tweet_results?: {
                result?: XTweetResult;
            };
        };
        items?: Array<{
            item?: {
                itemContent?: {
                    tweet_results?: {
                        result?: XTweetResult;
                    };
                };
            };
        }>;
    };
}
/** A tweet can be wrapped in visibility results; unwrap before reading. */
export interface XTweetResult {
    __typename?: string;
    rest_id?: string;
    /** present on TweetWithVisibilityResults */
    tweet?: XTweetResult;
    legacy?: XTweetLegacy;
    core?: {
        user_results?: {
            result?: XUserResult;
        };
    };
    note_tweet?: {
        note_tweet_results?: {
            result?: {
                text?: string;
            };
        };
    };
    views?: {
        count?: string;
        state?: string;
    };
}
export interface XTweetLegacy {
    full_text?: string;
    created_at?: string;
    favorite_count?: number;
    retweet_count?: number;
    reply_count?: number;
    entities?: {
        urls?: Array<{
            url?: string;
            expanded_url?: string;
            display_url?: string;
        }>;
    };
    extended_entities?: {
        media?: Array<{
            type?: string;
            media_url_https?: string;
        }>;
    };
}
export interface XUserResult {
    __typename?: string;
    id?: string;
    rest_id?: string;
    core?: {
        name?: string;
        screen_name?: string;
    };
    avatar?: {
        image_url?: string;
    };
    profile_bio?: {
        description?: string;
    };
}
