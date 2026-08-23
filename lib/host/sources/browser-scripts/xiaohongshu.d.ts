import type { XhsStructuredSearchExtraction } from "../xiaohongshu/types.ts";
export interface XhsNoteExtraction {
    id: string;
    title: string;
    url: string;
    snippet?: string;
    authorName?: string;
    authorUrl?: string;
    likes?: number;
    comments?: number;
    collects?: number;
    coverImage?: string;
}
export declare function extractXhsSearchState(): XhsStructuredSearchExtraction;
export declare function extractVisibleXhsSearch(): XhsNoteExtraction[];
export declare function extractXhsDetailState(noteId: string): {
    available: boolean;
    title?: string;
    text?: string;
    authorName?: string;
    authorUrl?: string;
    publishedAt?: string;
    likes?: number;
    collects?: number;
    comments?: number;
    images?: string[];
};
export declare function extractXhsNoteDetail(): {
    title?: string;
    text?: string;
    authorName?: string;
    authorUrl?: string;
    publishedAt?: string;
    likes?: number;
    collects?: number;
    comments?: number;
    images?: string[];
    isBlocked?: boolean;
};
