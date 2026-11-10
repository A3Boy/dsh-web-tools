/**
 * dsh-web-tools — media block formatting for fetched platform content.
 *
 * Both platform sources already receive image/video metadata from the page
 * payload; the model-facing fetch result, however, only carried the text. This
 * turns that metadata into a compact, copyable section so an agent can hand the
 * original image / MP4 URL to the user.
 * @module
 */
import type { SourceItem } from "./types.ts";
/** Original-size variant for an X media URL (X serves `?name=orig`). */
export declare function toOriginalXImageUrl(rawUrl: string): string;
/** Highest-bitrate MP4 among X's `video_info.variants`. */
export declare function pickHighestBitrateMp4(variants: Array<{
    content_type?: string;
    bitrate?: number;
    url?: string;
}> | undefined): string | undefined;
/**
 * Render a `[Media]` section for the fetched text.
 *
 * @returns the section, or an empty string when the item carries no media.
 */
export declare function formatMediaSection(item: Pick<SourceItem, "images" | "videoUrl" | "tags">): string;
/** Append the media section to a text body (idempotent when there is none). */
export declare function withMediaSection(text: string | undefined, item: Pick<SourceItem, "images" | "videoUrl" | "tags">): string | undefined;
