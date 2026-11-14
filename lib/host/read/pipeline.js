/**
 * dsh-web-tools — focused page reading pipeline (pure, no I/O).
 *
 * markdown → sections/chunks → BM25 against `focus` → budgeted selection.
 * The tool layer fetches the page and renders the result; everything here is
 * deterministic and unit-testable without a network or a DSH runtime.
 * @module
 */
import { splitMarkdown } from "./chunk.js";
import { bm25Scores } from "./rank.js";
import { selectPassages } from "./select.js";
import { clipCodePoints } from "./text.js";
import { createHash } from "node:crypto";
export const DEFAULT_MAX_CHARS = 6000;
export const MIN_MAX_CHARS = 500;
export const MAX_MAX_CHARS = 20000;
export const OUTLINE_LIMIT = 50;
const TITLE_MAX = 120;
export class UnknownSectionError extends Error {
    code = "UNKNOWN_SECTION";
    sectionId;
    available;
    // NOTE: no TS parameter properties — the repo's tests run under
    // `node --experimental-strip-types`, which only erases types.
    constructor(sectionId, available) {
        super(`Unknown section "${sectionId}". Available: ${available.slice(0, 20).join(", ")}`);
        this.name = "UnknownSectionError";
        this.sectionId = sectionId;
        this.available = available;
    }
}
export function clampMaxChars(value) {
    if (value === undefined || !Number.isFinite(value))
        return DEFAULT_MAX_CHARS;
    return Math.min(MAX_MAX_CHARS, Math.max(MIN_MAX_CHARS, Math.floor(value)));
}
function extractTitle(markdown) {
    const head = markdown.slice(0, 5000).replace(/\r\n?/g, "\n");
    const h1 = /^ {0,3}#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(head);
    const raw = h1 ? h1[1] : head.split("\n").find((l) => l.trim().length > 0);
    if (!raw)
        return undefined;
    const cleaned = raw
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*{1,3}(.+?)\*{1,3}/g, "$1")
        .replace(/[`*#>]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned ? clipCodePoints(cleaned, TITLE_MAX) : undefined;
}
export function readPage(markdown, opts = {}) {
    const budget = clampMaxChars(opts.maxChars);
    const { sections, chunks, totalChars } = splitMarkdown(markdown, { maxChunkChars: opts.maxChunkChars });
    let pool = chunks;
    let sectionInfo;
    if (opts.section) {
        const sec = sections.find((s) => s.id === opts.section);
        if (!sec)
            throw new UnknownSectionError(opts.section, sections.map((s) => s.id));
        pool = chunks.filter((c) => c.sectionId === sec.id);
        sectionInfo = { id: sec.id, heading: sec.heading };
    }
    const focus = opts.focus?.trim() ?? "";
    const scores = focus
        ? bm25Scores(pool.map((c) => ({ text: c.text, heading: c.headingPath.join(" ") })), focus)
        : pool.map(() => 0);
    const selection = selectPassages(pool, scores, {
        budgetChars: budget,
        includeLead: !opts.section,
        // Reading a specific section without a focus means "give me this section".
        fallbackChars: opts.section ? budget : undefined,
    });
    return {
        title: extractTitle(markdown),
        outline: sections.slice(0, OUTLINE_LIMIT).map(({ id, heading, level, chars }) => ({ id, heading, level, chars })),
        outlineTotal: sections.length,
        passages: selection.passages.map(({ chunk, score }) => ({
            sectionId: chunk.sectionId,
            heading: chunk.headingPath[chunk.headingPath.length - 1] ?? "",
            text: chunk.text,
            score: Math.round(score * 1000) / 1000,
        })),
        focusMatched: selection.focusMatched,
        truncated: selection.truncated,
        totalChars,
        returnedChars: selection.returnedChars,
        section: sectionInfo,
        contentId: createHash("sha256").update(markdown).digest("hex").slice(0, 8),
    };
}
