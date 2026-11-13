/**
 * dsh-web-tools — deterministic query-focused ranking (BM25).
 *
 * No model call and no dictionary: Latin/digit text is tokenised on word
 * boundaries; CJK text is tokenised into overlapping character bigrams plus
 * unigrams, which is robust without word segmentation and does not depend on
 * the ICU build of the running Node (unlike Intl.Segmenter).
 * @module
 */
/** Split text into search tokens (lowercased, NFKC-normalised). */
export declare function tokenize(text: string): string[];
export interface Bm25Doc {
    text: string;
    /** Heading path text; its tokens count `headingBoost` times. */
    heading?: string;
}
export interface Bm25Options {
    k1?: number;
    b?: number;
    headingBoost?: number;
}
/**
 * BM25 score of every doc against `query`. Returns an array aligned with
 * `docs`; all zeros when the query has no usable tokens or nothing matches.
 */
export declare function bm25Scores(docs: Bm25Doc[], query: string, opts?: Bm25Options): number[];
