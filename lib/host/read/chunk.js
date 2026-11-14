/**
 * dsh-web-tools — Markdown sectioning & chunking for focused page reading.
 *
 * Splits a Markdown document into sections (by ATX heading) and then into
 * chunks of bounded size. Properties the rest of the pipeline relies on:
 *
 *  - Deterministic: the same input always yields the same section ids and
 *    chunk boundaries, so `section` continuation calls stay valid when the
 *    page is served from the fetch cache.
 *  - Fenced code blocks are never mistaken for headings and are only split
 *    when a single block exceeds the chunk size.
 *  - Splitting works on code points, so CJK text and emoji are never cut in
 *    the middle of a surrogate pair.
 * @module
 */
import { cpLength } from "./text.js";
export const DEFAULT_MAX_CHUNK_CHARS = 800;
const MIN_CHUNK_CHARS = 50;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
function fenceMarker(line) {
    const m = FENCE_RE.exec(line);
    return m ? m[1] : null;
}
/** Next fenced-code state after `line` (`null` = outside a fence). */
function nextFenceState(state, line) {
    const marker = fenceMarker(line);
    if (!marker)
        return state;
    if (state === null)
        return marker;
    // A closing fence: same character, at least as long, nothing else on the line.
    const t = line.trim();
    if (t[0] === state[0] && t.length >= state.length && t === t[0].repeat(t.length))
        return null;
    return state;
}
function cleanHeading(raw) {
    return raw
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*{1,3}(.+?)\*{1,3}/g, "$1")
        .replace(/[`*]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function parseSections(markdown) {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const raw = [{ heading: "", level: 0, path: [], lines: [] }];
    const stack = [];
    let fence = null;
    for (const line of lines) {
        const insideBefore = fence !== null;
        const isFenceLine = fenceMarker(line) !== null;
        fence = nextFenceState(fence, line);
        if (!insideBefore && !isFenceLine) {
            const h = HEADING_RE.exec(line);
            if (h) {
                const heading = cleanHeading(h[2]);
                if (heading) {
                    const level = h[1].length;
                    while (stack.length && stack[stack.length - 1].level >= level)
                        stack.pop();
                    stack.push({ level, heading });
                    raw.push({ heading, level, path: stack.map((s) => s.heading), lines: [] });
                    continue;
                }
            }
        }
        raw[raw.length - 1].lines.push(line);
    }
    return raw;
}
/** Split a section body into blocks separated by blank lines (outside fences). */
function splitBlocks(body) {
    const blocks = [];
    let cur = [];
    let fence = null;
    const flush = () => {
        if (cur.length) {
            blocks.push(cur.join("\n"));
            cur = [];
        }
    };
    for (const line of body.split("\n")) {
        const before = fence;
        fence = nextFenceState(fence, line);
        if (before === null && fence === null && line.trim() === "") {
            flush();
            continue;
        }
        cur.push(line);
    }
    flush();
    return blocks;
}
const STRONG_BOUNDARY = new Set(["\n", "。", "！", "？", "!", "?", "；", ";"]);
const WEAK_BOUNDARY = new Set(["，", ",", "、", "：", ":", " ", "\t"]);
/** Index just after the best break point in (floor, end], or -1. */
function findBoundary(points, floor, end) {
    for (const strong of [true, false]) {
        for (let i = end; i > floor; i--) {
            const ch = points[i - 1];
            if (strong) {
                if (STRONG_BOUNDARY.has(ch))
                    return i;
                // A sentence-ending period only counts when followed by whitespace/end ("3.5" stays whole).
                if (ch === "." && (i >= points.length || /\s/.test(points[i])))
                    return i;
            }
            else if (WEAK_BOUNDARY.has(ch)) {
                return i;
            }
        }
    }
    return -1;
}
/** Split an oversized block into pieces of at most `max` code points. */
function splitLong(text, max) {
    const points = Array.from(text);
    const out = [];
    let start = 0;
    while (start < points.length) {
        let end = Math.min(start + max, points.length);
        if (end < points.length) {
            const floor = start + Math.max(1, Math.floor(max * 0.6));
            const cut = findBoundary(points, floor, end);
            if (cut > start)
                end = cut;
        }
        const piece = points.slice(start, end).join("").trim();
        if (piece)
            out.push(piece);
        start = end;
    }
    return out;
}
/** Greedily pack blocks into chunks of at most `max` code points. */
function packBlocks(blocks, max) {
    const out = [];
    let cur = "";
    let curLen = 0;
    const flush = () => {
        if (curLen > 0) {
            out.push(cur);
            cur = "";
            curLen = 0;
        }
    };
    for (const block of blocks) {
        const len = cpLength(block);
        if (len > max) {
            flush();
            out.push(...splitLong(block, max));
        }
        else if (curLen === 0) {
            cur = block;
            curLen = len;
        }
        else if (curLen + 2 + len <= max) {
            cur += "\n\n" + block;
            curLen += 2 + len;
        }
        else {
            flush();
            cur = block;
            curLen = len;
        }
    }
    flush();
    return out;
}
/** Split Markdown into sections and bounded chunks. */
export function splitMarkdown(markdown, opts = {}) {
    const max = Math.max(MIN_CHUNK_CHARS, Math.floor(opts.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS));
    const sections = [];
    const chunks = [];
    let totalChars = 0;
    for (const raw of parseSections(markdown)) {
        const body = raw.lines.join("\n").trim();
        if (!body)
            continue;
        const id = `s${sections.length}`;
        const chars = cpLength(body);
        sections.push({ id, heading: raw.heading, level: raw.level, chars });
        totalChars += chars;
        packBlocks(splitBlocks(body), max).forEach((text, n) => {
            chunks.push({
                index: chunks.length,
                id: `${id}c${n}`,
                sectionId: id,
                headingPath: raw.path,
                text,
                chars: cpLength(text),
            });
        });
    }
    return { sections, chunks, totalChars };
}
