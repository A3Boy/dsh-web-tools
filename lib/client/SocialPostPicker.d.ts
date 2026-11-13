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
 * Guarantees that interactive platform post cards appear in the main chat body
 * below the model's response, using memory-snapshot Chat nodes first and
 * seamlessly falling back to the plugin's host endpoint.
 */
export declare function TurnTailPicker(props: any): React.FunctionComponentElement<any> | null;
