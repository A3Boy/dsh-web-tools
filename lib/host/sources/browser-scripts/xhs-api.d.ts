/**
 * In-page Xiaohongshu search API call.
 *
 * IMPORTANT: this function is stringified and evaluated inside the signed-in
 * page (see `CdpPageLease.call`). It must therefore be fully self-contained:
 * no imports, no closures over module scope. Types are erased at compile time.
 *
 * Why not scrape the search UI? The UI flow (type → submit → scroll × 6) costs
 * 15-25s and is the main trigger for the slider challenge. The site's own web
 * client calls `POST /api/sns/web/v1/search/notes` signed by the obfuscated
 * `window._webmsxyw` helper that it installs — calling it from the page uses
 * the existing session, needs no paid API and returns JSON (including the
 * `xsec_token` that a later note fetch requires).
 */
export interface XhsApiSearchOptions {
    keyword: string;
    page?: number;
    pageSize?: number;
    /** `general` | `time_descending` | `popularity_descending` */
    sort?: string;
    /** 0 = all, 1 = video, 2 = image+text */
    noteType?: number;
}
export interface XhsApiSearchResult {
    ok: boolean;
    status?: number;
    /** `signer-unavailable` | `sign-failed` | `http-error` | `bad-payload` | `network` */
    error?: string;
    /** Site-level code from the JSON envelope (e.g. -100 = risk control). */
    code?: number;
    items: Array<Record<string, any>>;
    searchId?: string;
    hasMore?: boolean;
}
export declare function xhsSearchNotesViaApi(options: XhsApiSearchOptions): Promise<XhsApiSearchResult>;
export interface XhsApiDetailOptions {
    noteId: string;
    xsecToken?: string;
    xsecSource?: string;
}
export interface XhsApiDetailResult {
    ok: boolean;
    status?: number;
    error?: string;
    code?: number;
    note?: Record<string, any>;
}
export declare function xhsGetNoteDetailViaApi(options: XhsApiDetailOptions): Promise<XhsApiDetailResult>;
