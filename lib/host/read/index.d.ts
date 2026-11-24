/**
 * dsh-web-tools — focused page reading (web_read core). Pure, host-independent.
 * @module
 */
export { readPage, clampMaxChars, UnknownSectionError, DEFAULT_MAX_CHARS, MIN_MAX_CHARS, MAX_MAX_CHARS } from "./pipeline.ts";
export type { ReadPageOptions, ReadPageResult, ReadPassage, OutlineEntry } from "./pipeline.ts";
export { renderWebRead, UNTRUSTED_NOTICE } from "./render.ts";
export type { RenderInput } from "./render.ts";
