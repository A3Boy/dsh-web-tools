/**
 * dsh-web-tools — Xiaohongshu Specialized Platform Source Adapter.
 *
 * Implements `SpecializedSource` on Host:
 * - Probes authenticated status via Browser Bridge.
 * - Dispatches DOM search via `BridgeClient`.
 * - Fetches structured note content preserving `xsec_token`.
 *
 * @module
 */
import type { SpecializedSource, SpecializedPlatformId, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome } from "./types.ts";
import { BridgeClient } from "./bridge-client.ts";
export declare class XiaohongshuSource implements SpecializedSource {
    readonly id: SpecializedPlatformId;
    private bridgeClient;
    constructor(bridgeClient?: BridgeClient);
    probe(): Promise<SourceStatus>;
    search(request: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
}
/** Default Xiaohongshu Source instance */
export declare const defaultXiaohongshuSource: XiaohongshuSource;
