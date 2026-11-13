/**
 * dsh-web-tools — FetchPage adapter for web_read.
 *
 * Adapts a WebFetchProviderLike into the FetchPage contract expected by
 * web_read, mapping body.content, finalUrl, truncated, and backend.
 * @module
 */

export interface FetchedPage {
  /** Page body as Markdown/text (what the fetch provider already returns). */
  content: string;
  finalUrl?: string;
  /** True when the fetch provider cut the page short. */
  truncated?: boolean;
  backend?: string;
}

export type FetchPage = (url: string, signal: AbortSignal) => Promise<FetchedPage>;

export interface FetchProviderLike {
  fetch(
    req: { url: string },
    signal?: AbortSignal,
  ): Promise<{
    url: string;
    statusCode: number;
    body: { kind: string; content: string };
    truncated?: boolean;
    backend?: string;
  }>;
}

/**
 * Create a FetchPage function from a WebFetchProvider.
 */
export function createFetchPage(fetchProvider: FetchProviderLike): FetchPage {
  return async (url: string, signal: AbortSignal): Promise<FetchedPage> => {
    if (signal?.aborted) {
      const err = new Error("This operation was aborted");
      err.name = "AbortError";
      throw err;
    }
    const res = await fetchProvider.fetch({ url }, signal);
    if (!res || !res.body) {
      throw new Error(`fetchPage: empty response for ${url}`);
    }
    if (res.body.kind !== "text") {
      throw new Error(`fetchPage: expected text body but received ${res.body.kind}`);
    }
    return {
      content: res.body.content,
      finalUrl: res.url,
      truncated: res.truncated,
      backend: res.backend,
    };
  };
}
