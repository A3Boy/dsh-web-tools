/**
 * dsh-web-tools — code-point helpers shared by the web_read pipeline.
 *
 * All budgets in the read pipeline are measured in Unicode code points so a
 * CJK / emoji heavy page is not under- or over-counted the way `.length`
 * (UTF-16 units) would.
 * @module
 */
/** Number of Unicode code points in `text` (no intermediate array). */
export declare function cpLength(text: string): number;
/**
 * Keep the first `max` code points of `text`, ending with an ellipsis when cut.
 * Never splits a surrogate pair.
 */
export declare function clipCodePoints(text: string, max: number): string;
