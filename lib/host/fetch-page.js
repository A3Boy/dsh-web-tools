/**
 * dsh-web-tools — FetchPage adapter for web_read.
 *
 * Adapts a WebFetchProviderLike into the FetchPage contract expected by
 * web_read, mapping body.content, finalUrl, truncated, and backend.
 * @module
 */
/**
 * Create a FetchPage function from a WebFetchProvider.
 */
export function createFetchPage(fetchProvider) {
    return async (url, signal) => {
        if (signal?.aborted) {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            throw err;
        }
        const res = await fetchProvider.fetch({ url }, signal);
        if (!res || !res.body) {
            throw new Error(`fetchPage: empty response for ${url}`);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
            throw new Error(`fetchPage: HTTP ${res.statusCode}`);
        }
        if (res.body.kind !== "text") {
            throw new Error(`fetchPage: expected text body but received ${res.body.kind}`);
        }
        if (!res.body.content?.trim()) {
            throw new Error("fetchPage: no readable content extracted");
        }
        return {
            content: res.body.content,
            finalUrl: res.url,
            truncated: res.truncated,
            backend: res.backend,
        };
    };
}
