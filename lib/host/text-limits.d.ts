/**
 * dsh-web-tools — text bounds & safe string truncation.
 *
 * Enforces presentation-friendly snippet bounds (UI cards) and rich summary bounds
 * (LLM context prompt injection in DSH / MCP tool rendering) without slicing
 * multi-byte Unicode code points or emoji surrogate pairs into invalid characters.
 *
 * @module
 */
/** Max code-points for short, card-friendly single-line snippet. */
export declare const SNIPPET_MAX = 200;
/** Max code-points for full, model-facing summary (replacing snippet in DSH tool-web). */
export declare const SUMMARY_MAX = 800;
/**
 * Truncate text cleanly by Unicode code points (spread/Array.from-safe).
 * Never slices surrogate pairs (e.g. 👍⭐🔁💬) in half.
 */
export declare function truncate(text: string, maxCodePoints: number): string;
/**
 * Collapse tabs, newlines, and multiple spaces into a single clean line.
 */
export declare function toSingleLine(text: string): string;
