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
import { BridgeClient, defaultBridgeClient } from "./bridge-client.ts";

export class XSource implements SpecializedSource {
  public readonly id: SpecializedPlatformId = "x";
  private bridgeClient: BridgeClient;

  constructor(bridgeClient: BridgeClient = defaultBridgeClient) {
    this.bridgeClient = bridgeClient;
  }

  public async probe(): Promise<SourceStatus> {
    return this.bridgeClient.probeStatus("x");
  }

  public async search(request: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome> {
    return this.bridgeClient.executeSearch("x", request, signal);
  }

  public async fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome> {
    return this.bridgeClient.executeFetch("x", url, signal);
  }
}

/** Default Twitter / X Source instance */
export const defaultXSource = new XSource();
