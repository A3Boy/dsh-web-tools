export declare const DEFAULT_MAX_CHARS = 6000;
export declare const MIN_MAX_CHARS = 500;
export declare const MAX_MAX_CHARS = 20000;
export declare const OUTLINE_LIMIT = 50;
export interface ReadPageOptions {
    /** What the caller wants to know; ranks passages. Omit for the page start. */
    focus?: string;
    /** Output budget in code points; clamped to [500, 20000]. Default 6000. */
    maxChars?: number;
    /** Read one section (id from a previous outline) instead of the whole page. */
    section?: string;
    maxChunkChars?: number;
}
export interface OutlineEntry {
    id: string;
    heading: string;
    level: number;
    chars: number;
}
export interface ReadPassage {
    sectionId: string;
    heading: string;
    text: string;
    score: number;
}
export interface ReadPageResult {
    title?: string;
    outline: OutlineEntry[];
    /** Total sections in the page; may exceed `outline.length` (capped). */
    outlineTotal: number;
    passages: ReadPassage[];
    focusMatched: boolean;
    truncated: boolean;
    totalChars: number;
    returnedChars: number;
    /** Set when a single section was requested. */
    section?: {
        id: string;
        heading: string;
    };
    /** 8-character hex hash of page content for continuity checking. */
    contentId: string;
}
export declare class UnknownSectionError extends Error {
    readonly code = "UNKNOWN_SECTION";
    readonly sectionId: string;
    readonly available: string[];
    constructor(sectionId: string, available: string[]);
}
export declare function clampMaxChars(value: number | undefined): number;
export declare function readPage(markdown: string, opts?: ReadPageOptions): ReadPageResult;
