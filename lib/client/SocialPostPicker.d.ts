/**
 * dsh-web-tools — the `web_search` result card: a social-post picker.
 *
 * The agent gets a plain text result; this card is the HUMAN face of the same
 * call. It parses the text this repository itself produces (`Covers` block +
 * `Sources` list) into posts and renders a uniform, image-led list, so the user
 * picks a post to read instead of scanning a wall of markdown.
 *
 * Clicking 「深入了解」 does not fetch anything here: it sends a normal user
 * message ("详细读一下这篇：<url>") so the next Agent turn performs the read,
 * which keeps the model in charge of analysis.
 * @module
 */
import * as React from "react";
interface PlatformInfo {
    label: string;
    color: string;
}
interface PostPreview {
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
/**
 * Parse the model-facing `web_search` text into post previews.
 * @param text - the tool result text (Covers block + Sources list).
 */
export declare function parseSearchResult(text: string): {
    posts: PostPreview[];
    raw: string;
};
/**
 * The `web_search` tool result card.
 * @param props - slot props: `phase`/`block` for the call, plus `inputActions`.
 */
export declare function SocialPostPicker(props: any): React.DetailedReactHTMLElement<{
    className: string;
}, HTMLElement> | null;
export {};
