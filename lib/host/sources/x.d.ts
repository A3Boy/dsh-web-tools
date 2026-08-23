/**
 * dsh-web-tools — Twitter / X Specialized Platform Source Adapter.
 *
 * Implements `SpecializedSource` on Host:
 * - Probes authenticated status via Browser Bridge.
 * - Dispatches DOM search via `BridgeClient`.
 * - Fetches structured tweet content and threads.
 *
 * @module
 */
import type { SpecializedSource, SpecializedPlatformId, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome } from "./types.ts";
import { BridgeClient } from "./bridge-client.ts";
export declare class XSource implements SpecializedSource {
    readonly id: SpecializedPlatformId;
    private bridgeClient;
    constructor(bridgeClient?: BridgeClient);
    probe(): Promise<SourceStatus>;
    search(request: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
}
/** Default Twitter / X Source instance */
export declare const defaultXSource: XSource;
