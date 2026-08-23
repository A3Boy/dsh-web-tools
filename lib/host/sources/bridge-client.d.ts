/**
 * dsh-web-tools — Bridge Client Adapter for Specialized Sources.
 *
 * Provides typed methods for platform probing, authentication, search and fetch
 * communicating through BridgeHostServer.
 */
import { BridgeHostServer } from "./bridge-server.ts";
import type { SpecializedPlatformId, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome, SourceStatus } from "./types.ts";
export declare class BridgeClient {
    private server;
    constructor(server?: BridgeHostServer);
    /**
     * Probe authentication status of a platform
     */
    probeStatus(platform: SpecializedPlatformId): Promise<SourceStatus>;
    /**
     * Request extension to open platform login page
     */
    connectAuth(platform: SpecializedPlatformId): Promise<{
        status: string;
        url?: string;
    }>;
    /**
     * Execute platform search via extension (including SearchHints passthrough)
     */
    executeSearch(platform: SpecializedPlatformId, request: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    /**
     * Execute platform fetch via extension
     */
    executeFetch(platform: SpecializedPlatformId, url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
}
/** Global Bridge client */
export declare const defaultBridgeClient: BridgeClient;
