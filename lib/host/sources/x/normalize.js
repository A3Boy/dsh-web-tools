const TIMELINE_INSTRUCTION_TYPES = [
    "TimelineAddEntries",
    "TimelinePinEntry",
    "TimelineReplaceEntry",
];
/** Extract the numeric status / tweet ID from a tweet URL. */
export function extractTweetIdFromUrl(url) {
    if (!url)
        return undefined;
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : undefined;
}
/** Recognize the SearchTimeline envelope shape (lenient: missing pieces are ok). */
export function isSearchTimelineResponse(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    if (!Array.isArray(v.data?.search_by_raw_query?.search_timeline?.timeline?.instructions)) {
        return false;
    }
    return true;
}
/** Recognize the TweetDetail envelope shape. */
export function isTweetDetailResponse(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    if (!Array.isArray(v.data?.threaded_conversation_with_injections_v2?.instructions)) {
        return false;
    }
    return true;
}
/** Unwrap visibility wrapper; skips tombstones / unavailable / unknown types. */
export function unwrapTweetResult(result) {
    if (!result)
        return undefined;
    if (result.__typename === "TweetWithVisibilityResults") {
        return result.tweet && result.tweet.__typename === "Tweet"
            ? result.tweet
            : unwrapTweetResult(result.tweet);
    }
    if (result.__typename === "Tweet")
        return result;
    return undefined;
}
/** Is this a timeline entry we should collect (not cursor / promoted)? */
function isCollectibleEntry(entryId) {
    if (!entryId)
        return false;
    const lower = entryId.toLowerCase();
    if (lower.startsWith("cursor-"))
        return false;
    if (lower.includes("promoted"))
        return false;
    return true;
}
/** Parse legacy X date token "Mon Aug 24 02:22:42 +0000 2026" to RFC3339. */
export function parseXDateToken(createdAt) {
    if (!createdAt)
        return undefined;
    const epoch = Date.parse(createdAt);
    if (Number.isNaN(epoch))
        return undefined;
    return new Date(epoch).toISOString();
}
/** Expand t.co short links in the tweet text using entities.urls[].expanded_url. */
export function expandTweetUrls(text, urls) {
    let out = text;
    if (urls) {
        for (const u of urls) {
            if (u.url && u.expanded_url && out.includes(u.url)) {
                out = out.split(u.url).join(u.expanded_url);
            }
        }
    }
    return out;
}
/** Map a raw tweet result to a canonical SourceItem (PRIMARY GraphQL path). */
export function normalizeTweet(tweet) {
    const wrapped = unwrapTweetResult(tweet);
    if (!wrapped)
        return undefined;
    const id = wrapped.rest_id;
    const legacy = wrapped.legacy;
    // Long-form text wins; fall back to legacy.full_text.
    const rawText = wrapped.note_tweet?.note_tweet_results?.result?.text || legacy?.full_text || "";
    const text = expandTweetUrls(rawText, legacy?.entities?.urls);
    if (!id || !text)
        return undefined;
    const user = wrapped.core?.user_results?.result;
    const name = user?.core?.name;
    const handle = user?.core?.screen_name;
    const media = legacy?.extended_entities?.media || [];
    const images = media
        .map((m) => m.media_url_https)
        .filter((u) => Boolean(u));
    const views = wrapped.views?.count
        ? (() => {
            const n = parseInt(wrapped.views.count, 10);
            return Number.isNaN(n) ? undefined : n;
        })()
        : undefined;
    return {
        id,
        title: text.slice(0, 80) || "X Post",
        url: handle
            ? `https://x.com/${handle}/status/${id}`
            : `https://x.com/i/status/${id}`,
        text,
        snippet: text.slice(0, 300),
        author: name || handle
            ? {
                name: name || handle,
                handle: handle ? `@${handle}` : undefined,
                url: handle ? `https://x.com/${handle}` : undefined,
            }
            : undefined,
        publishedAt: parseXDateToken(legacy?.created_at),
        likes: legacy?.favorite_count,
        retweets: legacy?.retweet_count,
        replies: legacy?.reply_count,
        images: images.length > 0 ? images : undefined,
        coverImage: images[0],
        platform: "x",
    };
}
/**
 * PRIMARY X search extraction: iterate ONLY top-level timeline entries of the
 * add/pin/replace instructions and normalize their tweet_results. Ignores
 * quoted/retweeted inner tweets, conversations, cursors, and promoted noise.
 */
export function extractTweetsFromSearchTimeline(value) {
    if (!isSearchTimelineResponse(value))
        return [];
    const instructions = value.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];
    const items = [];
    const seen = new Set();
    for (const instruction of instructions) {
        const type = instruction.type || instruction.__typename || "";
        if (!TIMELINE_INSTRUCTION_TYPES.some((t) => type.includes(t)))
            continue;
        for (const entry of instruction.entries || []) {
            if (!isCollectibleEntry(entry.entryId))
                continue;
            const result = entry.content?.itemContent?.tweet_results?.result;
            const item = normalizeTweet(result || {});
            if (!item)
                continue;
            if (seen.has(item.id))
                continue;
            seen.add(item.id);
            items.push(item);
        }
    }
    return items;
}
/**
 * PRIMARY X fetch extraction: locate the EXACT focal tweet matching targetTweetId
 * from a TweetDetail GraphQL response. Checks both direct TimelineTimelineItem
 * entries and conversation thread module items, unwrapping visibility results.
 */
export function extractTweetFromTweetDetail(value, targetTweetId) {
    if (!isTweetDetailResponse(value) || !targetTweetId)
        return undefined;
    const instructions = value.data?.threaded_conversation_with_injections_v2?.instructions || [];
    for (const instruction of instructions) {
        const type = instruction.type || instruction.__typename || "";
        if (!TIMELINE_INSTRUCTION_TYPES.some((t) => type.includes(t)))
            continue;
        for (const entry of instruction.entries || []) {
            // 1. Direct tweet item
            const directResult = entry.content?.itemContent?.tweet_results?.result;
            if (directResult) {
                const unwrapped = unwrapTweetResult(directResult);
                if (unwrapped?.rest_id === targetTweetId) {
                    return normalizeTweet(unwrapped);
                }
            }
            // 2. Thread / module items (replies, conversation items)
            if (entry.content?.items) {
                for (const modItem of entry.content.items) {
                    const itemResult = modItem.item?.itemContent?.tweet_results?.result;
                    if (itemResult) {
                        const unwrapped = unwrapTweetResult(itemResult);
                        if (unwrapped?.rest_id === targetTweetId) {
                            return normalizeTweet(unwrapped);
                        }
                    }
                }
            }
        }
    }
    return undefined;
}
