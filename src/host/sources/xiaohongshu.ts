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
import { BridgeClient, defaultBridgeClient } from "./bridge-client.ts";

export class XiaohongshuSource implements SpecializedSource {
  public readonly id: SpecializedPlatformId = "xiaohongshu";
  private bridgeClient: BridgeClient;

  constructor(bridgeClient: BridgeClient = defaultBridgeClient) {
    this.bridgeClient = bridgeClient;
  }

  public async probe(): Promise<SourceStatus> {
    return this.bridgeClient.probeStatus("xiaohongshu");
  }

  public async search(request: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome> {
    return this.bridgeClient.executeSearch("xiaohongshu", request, signal);
  }

  public async fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome> {
    return this.bridgeClient.executeFetch("xiaohongshu", url, signal);
  }
}

/** Default Xiaohongshu Source instance */
export const defaultXiaohongshuSource = new XiaohongshuSource();
