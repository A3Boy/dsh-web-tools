import { type NativeBrowserRuntime } from "../browser/index.ts";
import type { SpecializedSource, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome, SourceItem } from "./types.ts";
export declare function setXhsNativeSearchEnabled(v: boolean): void;
export declare function isXhsNativeSearchEnabled(): boolean;
/** Parse "1.2万" / "3,412" / 88 into a number. */
export declare function parseXhsCount(value: unknown): number | undefined;
/**
 * Map one `/search/notes` item into a SourceItem.
 *
 * The real payload wraps each hit as
 * `{ id, model_type, note_card: { display_title, desc, user, interact_info,
 *    cover, xsec_token, type } }` — the note fields live under `note_card`, so
 * unwrap it before reading. Some responses (and older fixtures) are already
 * flat; both shapes are accepted.
 *
 * The URL keeps `xsec_token`: without it a later note fetch is redirected to
 * the login wall, which is why the UI-scraped path lost details whenever the
 * DOM link dropped the token.
 */
export declare function mapXhsApiNote(note: Record<string, any>): SourceItem | null;
/** Build the site's own search-results URL (the page then fetches the JSON). */
export declare function buildXhsSearchUrl(query: string, req?: SourceSearchRequest): string;
/** Pull note entries out of a captured `/search/notes` response payload. */
export declare function extractXhsNotesFromSearchPayload(json: unknown): Array<Record<string, any>>;
export declare class XiaohongshuSource implements SpecializedSource {
    readonly id: "xiaohongshu";
    readonly name = "\u5C0F\u7EA2\u4E66";
    private runtime;
    private readonly noteUrlCache;
    constructor(runtime?: NativeBrowserRuntime);
    status(): Promise<SourceStatus>;
    search(query: string, req?: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    /**
     * Fastest path: open the site's own search URL and CAPTURE the JSON the page
     * itself requests.
     *
     * Forging the request requires the site's full signature header set
     * (`X-S`, `X-T`, `x-S-Common`, `X-B3-Traceid`); with only the first two the
     * endpoint answers 500. Letting the page issue its own signed request avoids
     * that entirely — no headers to fake, no paid API — and still yields the JSON
     * (with note_card + xsec_token) instead of DOM scraping.
     */
    private searchViaDirectUrl;
    /**
     * Notes already rendered on the page (SSR / hydrated state), capped and
     * de-duplicated. Used before waiting on any network response.
     */
    private readRenderedNotes;
    /**
     * Fast path: signed in-page JSON search.
     *
     * Returns null (never throws) whenever this channel is unusable, so the
     * caller can fall back to the UI flow. Risk control, a renamed signer or an
     * empty payload are all "unusable", not "no results".
     */
    private searchViaApi;
    private nativeSearch;
    fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
    private rememberNoteUrl;
}
