/** Original-size variant for an X media URL (X serves `?name=orig`). */
export function toOriginalXImageUrl(rawUrl) {
    if (!rawUrl)
        return rawUrl;
    const [base] = rawUrl.split("?");
    return `${base}?format=jpg&name=orig`;
}
/** Highest-bitrate MP4 among X's `video_info.variants`. */
export function pickHighestBitrateMp4(variants) {
    if (!Array.isArray(variants))
        return undefined;
    const mp4s = variants
        .filter((v) => v?.content_type === "video/mp4" && typeof v.bitrate === "number" && typeof v.url === "string")
        .sort((a, b) => b.bitrate - a.bitrate);
    return mp4s[0]?.url;
}
/**
 * Render a `[Media]` section for the fetched text.
 *
 * @returns the section, or an empty string when the item carries no media.
 */
export function formatMediaSection(item) {
    const lines = [];
    const images = (item.images ?? []).filter((u) => typeof u === "string" && u.length > 0);
    if (images.length > 0) {
        lines.push(`Images (${images.length}):`);
        for (const url of images.slice(0, 12))
            lines.push(`- ${url}`);
        if (images.length > 12)
            lines.push(`- … ${images.length - 12} more`);
    }
    if (item.videoUrl)
        lines.push(`Video (MP4): ${item.videoUrl}`);
    if (item.tags && item.tags.length > 0)
        lines.push(`Tags: ${item.tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}`);
    return lines.length > 0 ? `[Media]\n${lines.join("\n")}` : "";
}
/** Append the media section to a text body (idempotent when there is none). */
export function withMediaSection(text, item) {
    const section = formatMediaSection(item);
    if (!section)
        return text;
    return text && text.trim().length > 0 ? `${text.trim()}\n\n${section}` : section;
}
