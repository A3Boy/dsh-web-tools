import { type NativeBrowserRuntime } from "../browser/index.ts";
import type { SpecializedSource, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome } from "./types.ts";
export declare function setXhsNativeSearchEnabled(v: boolean): void;
export declare function isXhsNativeSearchEnabled(): boolean;
export declare class XiaohongshuSource implements SpecializedSource {
    readonly id: "xiaohongshu";
    readonly name = "\u5C0F\u7EA2\u4E66";
    private runtime;
    constructor(runtime?: NativeBrowserRuntime);
    status(): Promise<SourceStatus>;
    search(query: string, req?: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    private experimentalNativeSearch;
    fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
}
