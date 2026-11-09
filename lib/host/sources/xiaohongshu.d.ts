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
export declare class XiaohongshuSource implements SpecializedSource {
    readonly id: "xiaohongshu";
    readonly name = "\u5C0F\u7EA2\u4E66";
    private runtime;
    private readonly noteUrlCache;
    constructor(runtime?: NativeBrowserRuntime);
    status(): Promise<SourceStatus>;
    search(query: string, req?: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
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
