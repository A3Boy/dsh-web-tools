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
    fetch(req: {
        url: string;
    }, signal?: AbortSignal): Promise<{
        url: string;
        statusCode: number;
        body: {
            kind: string;
            content: string;
        };
        truncated?: boolean;
        backend?: string;
    }>;
}
/**
 * Create a FetchPage function from a WebFetchProvider.
 */
export declare function createFetchPage(fetchProvider: FetchProviderLike): FetchPage;
