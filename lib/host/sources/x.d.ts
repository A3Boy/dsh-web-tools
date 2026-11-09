import { type NativeBrowserRuntime } from "../browser/index.ts";
import type { SpecializedSource, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome } from "./types.ts";
export declare function parseXMetricNumber(text?: string): number | undefined;
export declare function buildXSearchUrl(query: string, req?: SourceSearchRequest, forceLatest?: boolean): string;
export declare class XSource implements SpecializedSource {
    readonly id: "x";
    readonly name = "Twitter / X";
    private runtime;
    constructor(runtime?: NativeBrowserRuntime);
    status(): Promise<SourceStatus>;
    search(query: string, req?: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    /** One navigation + capture attempt against a concrete search URL. */
    private searchOnce;
    fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
}
