/**
 * web_read — DSH tool registration.
 *
 * Registers the `web_read` tool on `ctx.tools`. Uses deterministic BM25 passage
 * ranking against a `focus` query so only relevant excerpts and a section outline
 * enter context, instead of pouring entire long pages into the prompt.
 *
 * @module
 */
import type { Context } from "@deepseek-ai/cordis";
import { HarnessError } from "@deepseek-ai/dsh-llm";
import { type ReadPageResult } from "./pipeline.ts";
import type { FetchPage, FetchedPage } from "../fetch-page.ts";
import type { WebToolsContext } from "../context-types.ts";
export { type FetchPage, type FetchedPage };
/** Stable machine-routable error codes for web_read failures. */
export type WebReadErrorCode = "WEB_READ_INVALID_URL" | "WEB_READ_UNKNOWN_SECTION" | "WEB_READ_FETCH_FAILED" | "WEB_READ_PAGE_CHANGED";
/**
 * Domain-specific error class for web_read failures.
 * Extends HarnessError for canonical error taxonomy across the harness.
 */
export declare class WebReadError extends HarnessError {
    constructor(message: string, code: WebReadErrorCode, options?: ErrorOptions);
}
/** Canonical output schema for web_read results. */
export declare const webReadOutputSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly url: {
            readonly type: "string";
            readonly required: true;
        };
        readonly finalUrl: {
            readonly type: "string";
        };
        readonly title: {
            readonly type: "string";
        };
        readonly outline: {
            readonly type: "array";
            readonly required: true;
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly heading: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly level: {
                        readonly type: "number";
                        readonly required: true;
                    };
                    readonly chars: {
                        readonly type: "number";
                        readonly required: true;
                    };
                };
            };
        };
        readonly outlineTotal: {
            readonly type: "number";
            readonly required: true;
        };
        readonly passages: {
            readonly type: "array";
            readonly required: true;
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly sectionId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly heading: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly text: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly score: {
                        readonly type: "number";
                        readonly required: true;
                    };
                };
            };
        };
        readonly focusMatched: {
            readonly type: "boolean";
            readonly required: true;
        };
        readonly truncated: {
            readonly type: "boolean";
            readonly required: true;
        };
        readonly fetchTruncated: {
            readonly type: "boolean";
            readonly required: true;
        };
        readonly totalChars: {
            readonly type: "number";
            readonly required: true;
        };
        readonly returnedChars: {
            readonly type: "number";
            readonly required: true;
        };
        readonly backend: {
            readonly type: "string";
        };
        readonly section: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly heading: {
                    readonly type: "string";
                    readonly required: true;
                };
            };
        };
        readonly contentId: {
            readonly type: "string";
            readonly required: true;
        };
    };
};
export interface WebReadArgs {
    url: string;
    focus?: string;
    maxChars?: number;
    section?: string;
    contentId?: string;
}
export interface WebReadExecutionResult extends ReadPageResult {
    url: string;
    finalUrl?: string;
    fetchTruncated: boolean;
    backend?: string;
}
/**
 * Register the `web_read` tool with DSH runtime.
 * Performs runtime feature detection: if `ctx.tools.register` or `defineTool` is
 * not present on older host versions, logs a warning and returns undefined without crashing.
 */
export declare function registerWebRead(ctx: WebToolsContext | Context, fetchPage: FetchPage): (() => void) | undefined;
