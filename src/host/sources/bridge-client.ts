/**
 * dsh-web-tools — Bridge Client Adapter for Specialized Sources.
 *
 * Provides typed methods for platform probing, authentication, search and fetch
 * communicating through BridgeHostServer.
 */

import { defaultBridgeServer, BridgeHostServer } from "./bridge-server.ts";
import { createBridgeRequest } from "./bridge-protocol.ts";
import type { SpecializedPlatformId, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome, SourceStatus } from "./types.ts";

export class BridgeClient {
  private server: BridgeHostServer;

  constructor(server: BridgeHostServer = defaultBridgeServer) {
    this.server = server;
  }

  /**
   * Probe authentication status of a platform
   */
  public async probeStatus(platform: SpecializedPlatformId): Promise<SourceStatus> {
    const isConnected = this.server.isConnected();
    if (!isConnected) {
      return {
        id: platform,
        enabled: true,
        bridgeConnected: false,
        authenticated: false,
        lastCheckedAt: Date.now(),
      };
    }

    try {
      const req = createBridgeRequest("auth.status", { platform });
      const result = await this.server.sendRequest<{ authenticated: boolean; accountLabel?: string; accountId?: string }>(req, 5000);

      if (result?.authenticated) {
        this.server.setAccountInfo(platform, {
          accountLabel: result.accountLabel,
          accountId: result.accountId,
          verifiedAt: Date.now(),
        });
      }

      return {
        id: platform,
        enabled: true,
        bridgeConnected: true,
        authenticated: Boolean(result?.authenticated),
        account: result?.authenticated ? { accountLabel: result.accountLabel, accountId: result.accountId } : undefined,
        lastCheckedAt: Date.now(),
      };
    } catch (err: unknown) {
      return {
        id: platform,
        enabled: true,
        bridgeConnected: true,
        authenticated: false,
        lastError: err instanceof Error ? err.message : String(err),
        lastCheckedAt: Date.now(),
      };
    }
  }

  /**
   * Request extension to open platform login page
   */
  public async connectAuth(platform: SpecializedPlatformId): Promise<{ status: string; url?: string }> {
    const req = createBridgeRequest("auth.connect", { platform });
    return this.server.sendRequest<{ status: string; url?: string }>(req, 10000);
  }

  /**
   * Execute platform search via extension
   */
  public async executeSearch(
    platform: SpecializedPlatformId,
    request: SourceSearchRequest,
    signal?: AbortSignal,
  ): Promise<SourceSearchOutcome> {
    const start = Date.now();
    const req = createBridgeRequest("source.search", {
      platform,
      query: request.query,
      maxResults: request.maxResults,
    });

    try {
      const result = await this.server.sendRequest<{ sources: any[] }>(req, 25000, signal);
      return {
        id: platform,
        mode: "native-browser",
        sources: result?.sources ?? [],
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      return {
        id: platform,
        mode: "native-browser",
        sources: [],
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Execute platform fetch via extension
   */
  public async executeFetch(
    platform: SpecializedPlatformId,
    url: string,
    signal?: AbortSignal,
  ): Promise<SourceFetchOutcome> {
    const start = Date.now();
    const req = createBridgeRequest("source.fetch", { platform, url });

    try {
      const result = await this.server.sendRequest<any>(req, 25000, signal);
      return {
        id: platform,
        mode: "native-browser",
        url,
        title: result?.title,
        text: result?.text,
        author: result?.author,
        publishedAt: result?.publishedAt,
        metrics: result?.metrics,
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      return {
        id: platform,
        mode: "native-browser",
        url,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/** Global Bridge client */
export const defaultBridgeClient = new BridgeClient();
