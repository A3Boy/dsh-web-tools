import { buildXhsNoteUrl } from "./query.js";
export function parseXhsMetricNumber(text) {
    if (text === undefined || text === null)
        return undefined;
    if (typeof text === "number")
        return Number.isFinite(text) ? text : undefined;
    const raw = String(text).trim().replace(/,/g, "");
    if (!raw)
        return undefined;
    if (/^\d+$/.test(raw))
        return parseInt(raw, 10);
    // 10万+ / 1.7万 / 10w+ / 10W
    const wanMatch = raw.match(/^([\d.]+)\s*[万wW]\+?$/);
    if (wanMatch)
        return Math.round(parseFloat(wanMatch[1]) * 10000);
    // 1.2K / 1.2k
    const kMatch = raw.match(/^([\d.]+)\s*[kK]\+?$/);
    if (kMatch)
        return Math.round(parseFloat(kMatch[1]) * 1000);
    // 100+ / 99+
    const plusMatch = raw.match(/^(\d+)\+$/);
    if (plusMatch)
        return parseInt(plusMatch[1], 10);
    return undefined;
}
export function isNoteFeed(feed) {
    return feed?.modelType === "note" && typeof feed?.id === "string" && feed.id.trim().length > 0;
}
/** First non-empty line, whitespace-collapsed and truncated. */
export function firstLine(text, max = 60) {
    if (!text)
        return "";
    const line = text
        .split(/\r?\n/)
        .map((part) => part.trim())
        .find((part) => part.length > 0);
    return (line ?? "").replace(/\s+/g, " ").slice(0, max);
}
export function normalizeXhsFeed(feed) {
    if (!isNoteFeed(feed))
        return null;
    const noteId = feed.id.trim();
    const card = feed.noteCard;
    const user = card?.user;
    const interact = card?.interactInfo;
    // Many life-log notes ship no title at all; showing "小红书笔记" hides the
    // only text a reader (or an LLM) could use to judge relevance. Fall back to
    // the first line of the body.
    const desc = (card?.desc || "").trim();
    const title = (card?.displayTitle || "").trim() || firstLine(desc) || "小红书笔记";
    const url = buildXhsNoteUrl(noteId, feed.xsecToken);
    const authorName = (user?.nickname || user?.nickName || "").trim();
    const authorUserId = (user?.userId || "").trim();
    const authorUrl = authorUserId
        ? `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(authorUserId)}`
        : undefined;
    const cover = card?.cover;
    const coverImage = cover?.urlDefault || cover?.urlPre || cover?.url || undefined;
    const likes = parseXhsMetricNumber(interact?.likedCount);
    return {
        id: noteId,
        title,
        url,
        snippet: desc ? desc.replace(/\s+/g, " ").slice(0, 200) : title,
        author: authorName ? { name: authorName, url: authorUrl } : undefined,
        likes,
        coverImage,
        platform: "xiaohongshu",
    };
}
