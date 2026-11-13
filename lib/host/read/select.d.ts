/**
 * dsh-web-tools — budgeted passage selection.
 *
 * Given ranked chunks and a character budget, picks the passages to return:
 *  - with a focus that matches: the lead chunk (intro) plus the best-scoring
 *    chunks that fit the budget, returned in document order;
 *  - with no focus or no match: the start of the document, in order, up to a
 *    fallback size — never an arbitrary slice of the middle.
 * The returned total never exceeds the budget.
 * @module
 */
import type { Chunk } from "./chunk.ts";
export declare const DEFAULT_FALLBACK_CHARS = 3000;
export interface SelectOptions {
    /** Maximum total code points to return. */
    budgetChars: number;
    /** Include the first chunk (page intro) when focus matches. Default true. */
    includeLead?: boolean;
    /** Largest lead chunk worth reserving budget for. Default 1000. */
    leadChars?: number;
    /** Drop matches scoring below this fraction of the best score. Default 0.3. */
    minRelativeScore?: number;
    /** Size of the in-order prefix returned when nothing matches. Default 3000. */
    fallbackChars?: number;
}
export interface SelectedPassage {
    chunk: Chunk;
    score: number;
}
export interface Selection {
    /** Selected passages in document order. */
    passages: SelectedPassage[];
    /** True when the focus produced at least one scoring chunk. */
    focusMatched: boolean;
    returnedChars: number;
    /** True when part of the (pool of the) page was left out. */
    truncated: boolean;
}
export declare function selectPassages(chunks: Chunk[], scores: number[], opts: SelectOptions): Selection;
