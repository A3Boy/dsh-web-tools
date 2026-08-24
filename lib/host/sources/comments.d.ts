import type { SourceComment, SourceItem } from "./types.ts";
export declare const MAX_FETCHED_COMMENTS = 30;
export declare function normalizeComments(input: SourceComment[], limit?: number): {
    comments: SourceComment[];
    truncated: boolean;
};
export declare function appendCommentsToItem(item: SourceItem, rawComments: SourceComment[], options: {
    heading: string;
    truncated?: boolean;
    limit?: number;
}): SourceItem;
