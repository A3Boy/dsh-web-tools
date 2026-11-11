/**
 * dsh-web-tools — the `web_search` result card: interactive SocialPostPicker.
 *
 * Implements the native post picker UI matching the design specification:
 * - Header with total post count and platform distribution badge.
 * - Horizontal cards with fixed-ratio cover images (or clean empty text post placeholder).
 * - Platform badges (Xiaohongshu red, X dark), author, relative dates.
 * - 2-line clamped title and summary.
 * - Engagement stats with official primitives SVG icons (IconLikeOutline16, IconSparkle16,
 *   IconQueueOutline14, IconRefreshOutline14) — ZERO emojis.
 * - Action buttons: Primary [深入了解 ↗] triggering deep-reading in the next turn,
 *   and Secondary [查看原帖] opening the post in a new tab.
 * - Footer with summary and raw toggle.
 * @module
 */
import * as React from "react";
import { parseSearchResult, shortCount, relativeDate, type PostPreview } from "./social-post-picker-model.ts";
export { parseSearchResult, shortCount, relativeDate, type PostPreview };
/**
 * The `web_search` interactive post picker card component.
 */
export declare function SocialPostPicker(props: any): React.DetailedReactHTMLElement<{
    className: string;
}, HTMLElement> | null;
/**
 * The picker rendered in the Turn tail.
 *
 * The `web_search` key of `tool.call.toolview` is already occupied by the
 * shell's own row and cannot be shadowed from a plugin (both registrations
 * coexist and the shell's stays active), so the same card is mounted where a
 * plugin is guaranteed to render: below the answer, fed by the Turn's tool
 * result.
 * @param props - Turn-tail props: `turn` plus the standard `inputActions`/`useChat`.
 */
export declare function TurnTailPicker(props: any): React.FunctionComponentElement<any> | null;
