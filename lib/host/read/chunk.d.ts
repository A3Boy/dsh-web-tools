export declare const DEFAULT_MAX_CHUNK_CHARS = 800;
export interface Section {
    /** Stable id (`s0`, `s1`, …) assigned in document order to non-empty sections. */
    id: string;
    /** Cleaned heading text; empty for the preamble before the first heading. */
    heading: string;
    /** Heading level 1–6; 0 for the preamble. */
    level: number;
    /** Body size in code points. */
    chars: number;
}
export interface Chunk {
    /** Position in the whole-document chunk list. */
    index: number;
    id: string;
    sectionId: string;
    /** Ancestor headings ending with this chunk's own section heading. */
    headingPath: string[];
    text: string;
    /** Size of `text` in code points. */
    chars: number;
}
export interface SplitResult {
    sections: Section[];
    chunks: Chunk[];
    /** Total body size in code points across all sections. */
    totalChars: number;
}
export interface ChunkOptions {
    maxChunkChars?: number;
}
/** Split Markdown into sections and bounded chunks. */
export declare function splitMarkdown(markdown: string, opts?: ChunkOptions): SplitResult;
