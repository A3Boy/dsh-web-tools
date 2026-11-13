/**
 * dsh-web-tools — code-point helpers shared by the web_read pipeline.
 *
 * All budgets in the read pipeline are measured in Unicode code points so a
 * CJK / emoji heavy page is not under- or over-counted the way `.length`
 * (UTF-16 units) would.
 * @module
 */
/** Number of Unicode code points in `text` (no intermediate array). */
export function cpLength(text) {
    let n = 0;
    for (const _ of text)
        n++;
    return n;
}
/**
 * Keep the first `max` code points of `text`, ending with an ellipsis when cut.
 * Never splits a surrogate pair.
 */
export function clipCodePoints(text, max) {
    if (max <= 0)
        return "";
    const points = Array.from(text);
    if (points.length <= max)
        return text;
    return points.slice(0, Math.max(0, max - 1)).join("") + "…";
}
