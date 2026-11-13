/**
 * dsh-web-tools — focused page reading (web_read core). Pure, host-independent.
 * @module
 */
export { readPage, clampMaxChars, UnknownSectionError, DEFAULT_MAX_CHARS, MIN_MAX_CHARS, MAX_MAX_CHARS } from "./pipeline.js";
export { renderWebRead, UNTRUSTED_NOTICE } from "./render.js";
