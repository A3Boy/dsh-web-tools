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
export type XhsPageState = "ready" | "login-wall" | "security-verification" | "signed-out";
export declare function detectXhsPageState(): XhsPageState;
export declare function setXhsSearchInput(query: string): boolean;
export declare function submitXhsSearch(): boolean;
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
