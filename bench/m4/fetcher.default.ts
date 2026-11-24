/**
 * M4 benchmark — fetcher adapter.
 *
 * Wires the benchmark fixture fetcher to dsh-web-tools' generic web fetcher
 * (`fetchGenericWebPage`), which performs Defuddle-style Markdown extraction,
 * SSRF guard, DNS rebinding checks, and timeout budgets.
 *
 * @module
 */
import { fetchGenericWebPage } from "../../src/host/generic-fetch.ts";

export async function fetchPage(url: string, signal: AbortSignal): Promise<{ content: string }> {
  const res = await fetchGenericWebPage(url, { signal, timeoutMs: 30_000 });
  return { content: res.content };
}
