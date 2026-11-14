/**
 * dsh-web-tools — focused page reading pipeline (pure, no I/O).
 *
 * markdown → sections/chunks → BM25 against `focus` → budgeted selection.
 * The tool layer fetches the page and renders the result; everything here is
 * deterministic and unit-testable without a network or a DSH runtime.
 * @module
 */
import { splitMarkdown, type Section } from "./chunk.ts";
import { bm25Scores } from "./rank.ts";
import { selectPassages } from "./select.ts";
import { clipCodePoints } from "./text.ts";
import { createHash } from "node:crypto";

export const DEFAULT_MAX_CHARS = 6000;
export const MIN_MAX_CHARS = 500;
export const MAX_MAX_CHARS = 20000;
export const OUTLINE_LIMIT = 50;
const TITLE_MAX = 120;

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
  section?: { id: string; heading: string };
  /** 8-character hex hash of page content for continuity checking. */
  contentId: string;
}

export class UnknownSectionError extends Error {
  readonly code = "UNKNOWN_SECTION";
  readonly sectionId: string;
  readonly available: string[];
  // NOTE: no TS parameter properties — the repo's tests run under
  // `node --experimental-strip-types`, which only erases types.
  constructor(sectionId: string, available: string[]) {
    super(`Unknown section "${sectionId}". Available: ${available.slice(0, 20).join(", ")}`);
    this.name = "UnknownSectionError";
    this.sectionId = sectionId;
    this.available = available;
  }
}

export function clampMaxChars(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_CHARS;
  return Math.min(MAX_MAX_CHARS, Math.max(MIN_MAX_CHARS, Math.floor(value)));
}

function extractTitle(markdown: string): string | undefined {
  const head = markdown.slice(0, 5000).replace(/\r\n?/g, "\n");
  const h1 = /^ {0,3}#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(head);
  const raw = h1 ? h1[1] : head.split("\n").find((l) => l.trim().length > 0);
  if (!raw) return undefined;

  let text = raw.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const codeTokens: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const id = `\x00CODE_${codeTokens.length}\x00`;
    codeTokens.push(code);
    return id;
  });
  text = text.replace(/\*\*([^*]+?)\*\*/g, "$1");
  text = text.replace(/(^|[^\w*])\*([^*]+?)\*(?=[^\w*]|$)/g, "$1$2");
  text = text.replace(/\x00CODE_(\d+)\x00/g, (_, idx) => codeTokens[Number(idx)] ?? "");
  const cleaned = text.replace(/[#>]/g, "").replace(/\s+/g, " ").trim();
  return cleaned ? clipCodePoints(cleaned, TITLE_MAX) : undefined;
}

export function readPage(markdown: string, opts: ReadPageOptions = {}): ReadPageResult {
  const budget = clampMaxChars(opts.maxChars);
  const { sections, chunks, totalChars } = splitMarkdown(markdown, { maxChunkChars: opts.maxChunkChars });

  let pool = chunks;
  let sectionInfo: ReadPageResult["section"];
  if (opts.section) {
    const sec: Section | undefined = sections.find((s) => s.id === opts.section);
    if (!sec) throw new UnknownSectionError(opts.section, sections.map((s) => s.id));
    pool = chunks.filter((c) => c.sectionId === sec.id);
    sectionInfo = { id: sec.id, heading: sec.heading };
  }

  const focus = opts.focus?.trim() ?? "";
  const scores = focus
    ? bm25Scores(
        pool.map((c) => ({ text: c.text, heading: c.headingPath.join(" ") })),
        focus,
      )
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
