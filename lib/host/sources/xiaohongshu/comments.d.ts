import type { SourceComment } from "../types.ts";
interface XhsCommentParseResult {
    comments: SourceComment[];
    truncated: boolean;
}
/** Parse the browser's own comment-page JSON response without calling private APIs. */
export declare function extractXhsComments(value: unknown): XhsCommentParseResult;
export {};
