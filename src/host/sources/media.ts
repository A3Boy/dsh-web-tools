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
export function toOriginalXImageUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  const [base] = rawUrl.split("?");
  return `${base}?format=jpg&name=orig`;
}

/**
 * Map a 小红书 CDN image URL to the watermark-free original node.
 *
 * Web images come from `sns-webpic`/`sns-img` with a `!nd_dft_wlteh_webp_3`
 * suffix (WebP, cropped, watermarked). The `1040g…` file id delivered to the
 * public Huawei CDN node serves the same asset at full size without the
 * watermark. Anything that does not match the id pattern is returned unchanged.
 */
export function resolveXhsOriginalImage(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  const match = rawUrl.match(/(1040g[^!?/]+)/);
  if (!match) return rawUrl;
  return `https://sns-img-hw.xhscdn.com/${match[1]}?imageView2/2/w/format/png`;
}

/** Highest-bitrate MP4 among X's `video_info.variants`. */export function pickHighestBitrateMp4(
  variants: Array<{ content_type?: string; bitrate?: number; url?: string }> | undefined,
): string | undefined {
  if (!Array.isArray(variants)) return undefined;
  const mp4s = variants
    .filter((v) => v?.content_type === "video/mp4" && typeof v.bitrate === "number" && typeof v.url === "string")
    .sort((a, b) => (b.bitrate as number) - (a.bitrate as number));
  return mp4s[0]?.url;
}

/**
 * Render a `[Media]` section for the fetched text.
 *
 * @returns the section, or an empty string when the item carries no media.
 */
export function formatMediaSection(item: Pick<SourceItem, "images" | "videoUrl" | "tags">): string {
  const lines: string[] = [];
  const images = (item.images ?? []).filter((u) => typeof u === "string" && u.length > 0);
  if (images.length > 0) {
    lines.push(`Images (${images.length}):`);
    for (const url of images.slice(0, 12)) lines.push(`- ${url}`);
    if (images.length > 12) lines.push(`- … ${images.length - 12} more`);
  }
  if (item.videoUrl) lines.push(`Video (MP4): ${item.videoUrl}`);
  if (item.tags && item.tags.length > 0) lines.push(`Tags: ${item.tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}`);
  return lines.length > 0 ? `[Media]\n${lines.join("\n")}` : "";
}

/** Append the media section to a text body (idempotent when there is none). */
export function withMediaSection(text: string | undefined, item: Pick<SourceItem, "images" | "videoUrl" | "tags">): string | undefined {
  const section = formatMediaSection(item);
  if (!section) return text;
  return text && text.trim().length > 0 ? `${text.trim()}\n\n${section}` : section;
}
