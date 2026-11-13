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
import { defineTool, type ToolRunContext } from "@deepseek-ai/dsh-tools";
import { HarnessError } from "@deepseek-ai/dsh-llm";
import { UnknownSectionError, readPage, type ReadPageResult } from "./pipeline.ts";
import { renderWebRead } from "./render.ts";
import type { FetchPage, FetchedPage } from "../fetch-page.ts";
import type { WebToolsContext } from "../context-types.ts";

export { type FetchPage, type FetchedPage };

/** Stable machine-routable error codes for web_read failures. */
export type WebReadErrorCode =
  | "WEB_READ_INVALID_URL"
  | "WEB_READ_UNKNOWN_SECTION"
  | "WEB_READ_FETCH_FAILED"
  | "WEB_READ_PAGE_CHANGED";

/**
 * Domain-specific error class for web_read failures.
 * Extends HarnessError for canonical error taxonomy across the harness.
 */
export class WebReadError extends HarnessError {
  constructor(message: string, code: WebReadErrorCode, options?: ErrorOptions) {
    super(message, code, options);
    this.name = "WebReadError";
  }
}

/** ValueSchemaSpec for outline items in PTC and structured tool outputs. */
const outlineEntrySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", required: true },
    heading: { type: "string", required: true },
    level: { type: "number", required: true },
    chars: { type: "number", required: true },
  },
} as const;

/** ValueSchemaSpec for selected passages. */
const passageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sectionId: { type: "string", required: true },
    heading: { type: "string", required: true },
    text: { type: "string", required: true },
    score: { type: "number", required: true },
  },
} as const;

/** ValueSchemaSpec for requested section metadata. */
const sectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", required: true },
    heading: { type: "string", required: true },
  },
} as const;

/** Canonical output schema for web_read results. */
export const webReadOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    url: { type: "string", required: true },
    finalUrl: { type: "string" },
    title: { type: "string" },
    outline: {
      type: "array",
      required: true,
      items: outlineEntrySchema,
    },
    outlineTotal: { type: "number", required: true },
    passages: {
      type: "array",
      required: true,
      items: passageSchema,
    },
    focusMatched: { type: "boolean", required: true },
    truncated: { type: "boolean", required: true },
    fetchTruncated: { type: "boolean", required: true },
    totalChars: { type: "number", required: true },
    returnedChars: { type: "number", required: true },
    backend: { type: "string" },
    section: sectionSchema,
    contentId: { type: "string", required: true },
  },
} as const;

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
export function registerWebRead(ctx: WebToolsContext | Context, fetchPage: FetchPage): (() => void) | undefined {
  const toolsService = (ctx as { tools?: { register?: (def: unknown) => () => void } }).tools;
  if (typeof toolsService?.register !== "function" || typeof defineTool !== "function") {
    const logger = (ctx as { logger?: { warn?: (msg: string) => void } }).logger ?? console;
    logger.warn?.("tools.register or defineTool not available on host; skipping web_read tool registration");
    return undefined;
  }

  const toolDef = defineTool({
    name: "web_read",
    description:
      "Read a web page focused on a question. Returns only the passages most relevant to `focus` plus an outline of the page, " +
      "instead of the whole page. Prefer this over web_fetch for long pages or when you need one specific fact. " +
      "Pass `section` (an id from a previous outline) to read one section in full.",
    parameters: {
      url: { type: "string", required: true, description: "Page URL (http/https)." },
      focus: { type: "string", description: "What you want to know; used to pick passages. Omit to read from the start." },
      maxChars: { type: "number", description: "Output budget in characters (500–20000, default 6000)." },
      section: { type: "string", description: 'Section id from a previous outline, e.g. "s3".' },
      contentId: { type: "string", description: "Optional content identifier from a previous call to ensure section continuity." },
    },
    output: {
      schema: webReadOutputSchema,
      render: (args, value) => [
        {
          type: "text",
          text: renderWebRead({
            url: args.url,
            finalUrl: value.finalUrl,
            focus: args.focus,
            result: value as unknown as ReadPageResult,
            fetchTruncated: value.fetchTruncated,
            backend: value.backend,
          }),
        },
      ],
    },
    async execute(args, exec: ToolRunContext): Promise<WebReadExecutionResult> {
      if (!/^https?:\/\//i.test(args.url)) {
        throw new WebReadError("web_read: url must start with http:// or https://", "WEB_READ_INVALID_URL");
      }

      let page: FetchedPage;
      try {
        page = await fetchPage(args.url, exec.signal);
      } catch (err: unknown) {
        if (err instanceof WebReadError) throw err;
        if (err instanceof Error && (err.name === "AbortError" || exec.signal.aborted)) {
          throw err;
        }
        const message = err instanceof Error ? err.message : String(err);
        throw new WebReadError(`web_read: fetch failed: ${message}`, "WEB_READ_FETCH_FAILED", { cause: err });
      }

      try {
        const result = readPage(page.content, {
          focus: args.focus,
          maxChars: args.maxChars,
          section: args.section,
        });

        if (args.contentId && result.contentId && args.contentId !== result.contentId) {
          throw new WebReadError(
            `web_read: page content has changed since previous call (expected contentId ${args.contentId}, found ${result.contentId}). Call web_read without section to get an updated outline.`,
            "WEB_READ_PAGE_CHANGED",
          );
        }

        return {
          ...result,
          url: args.url,
          finalUrl: page.finalUrl,
          fetchTruncated: page.truncated ?? false,
          backend: page.backend,
        };
      } catch (err: unknown) {
        if (err instanceof WebReadError) throw err;
        if (err instanceof UnknownSectionError) {
          throw new WebReadError(err.message, "WEB_READ_UNKNOWN_SECTION", { cause: err });
        }
        throw err;
      }
    },
  });

  return toolsService.register(toolDef);
}
