/**
 * web_read — DSH tool registration EXAMPLE.
 *
 * !! NOT compiled or run against @deepseek-ai/dsh-tools. !!
 * Written from docs/cookbook/adding-a-tool.md. Before using it:
 *   1. add "@deepseek-ai/dsh-tools" to peerDependencies (check the version range
 *      on every DSH line in the CI matrix) and confirm `defineTool` is exported;
 *   2. fill in `output.schema` with the ValueSchemaSpec syntax from the
 *      dsh-tools README (marked TODO below);
 *   3. throw a HarnessError subclass with a stable `code` for expected failures
 *      (see the dsh-error-handling skill) instead of the plain Errors below;
 *   4. wire `fetchPage` to the SAME cached fetch provider the plugin already
 *      registers, so web_read shares the 5-minute fetch cache and SSRF guards.
 *
 * Remove the ".example" suffix once it compiles.
 * @module
 */
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { UnknownSectionError, readPage } from "./pipeline.ts";
import { renderWebRead } from "./render.ts";

export interface FetchedPage {
  /** Page body as Markdown/text (what the fetch provider already returns). */
  content: string;
  finalUrl?: string;
  /** True when the fetch provider cut the page short. */
  truncated?: boolean;
  backend?: string;
}

export type FetchPage = (url: string, signal: AbortSignal) => Promise<FetchedPage>;

export function registerWebRead(ctx: Context, fetchPage: FetchPage) {
  return ctx.tools.register(
    defineTool({
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
      },
      output: {
        // TODO: express this as a ValueSchemaSpec. Keep it a useful programmatic API
        // for PTC: { title?, url, outline[], passages[], focusMatched, truncated, ... }.
        schema: undefined as never,
        render: (args: { url: string; focus?: string }, value: any) => [
          { type: "text", text: renderWebRead({ url: args.url, finalUrl: value.finalUrl, focus: args.focus, result: value, fetchTruncated: value.fetchTruncated, backend: value.backend }) },
        ],
      },
      async execute(args: { url: string; focus?: string; maxChars?: number; section?: string }, exec: { signal: AbortSignal }) {
        // Constraints the parameter DSL cannot express are checked by hand.
        if (!/^https?:\/\//i.test(args.url)) throw new Error("web_read: url must start with http:// or https://");

        const page = await fetchPage(args.url, exec.signal); // honors exec.signal
        try {
          const result = readPage(page.content, { focus: args.focus, maxChars: args.maxChars, section: args.section });
          return { ...result, url: args.url, finalUrl: page.finalUrl, fetchTruncated: page.truncated ?? false, backend: page.backend };
        } catch (err) {
          if (err instanceof UnknownSectionError) throw new Error(err.message); // → HarnessError subclass, code "UNKNOWN_SECTION"
          throw err;
        }
      },
    }),
  );
}
