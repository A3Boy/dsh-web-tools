/**
 * dsh-web-tools — Bridge Client Adapter for Specialized Sources.
 *
 * Provides typed methods for platform probing, authentication, search and fetch
 * communicating through BridgeHostServer.
 */
import { defaultBridgeServer, BridgeHostServer } from "./bridge-server.js";
import { createBridgeRequest } from "./bridge-protocol.js";
export class BridgeClient {
    server;
    constructor(server = defaultBridgeServer) {
        this.server = server;
    }
    /**
     * Probe authentication status of a platform
     */
    async probeStatus(platform) {
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
            const result = await this.server.sendRequest(req, 5000);
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
        }
        catch (err) {
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
    async connectAuth(platform) {
        const req = createBridgeRequest("auth.connect", { platform });
        return this.server.sendRequest(req, 10000);
    }
    /**
     * Execute platform search via extension (including SearchHints passthrough)
     */
    async executeSearch(platform, request, signal) {
        const start = Date.now();
        const req = createBridgeRequest("source.search", {
            platform,
            query: request.query,
            maxResults: request.maxResults,
            hints: request.hints ? {
                topic: request.hints.topic,
                freshness: request.hints.freshness,
                locale: request.hints.locale,
            } : undefined,
        });
        try {
            const result = await this.server.sendRequest(req, 25000, signal);
            return {
                id: platform,
                mode: "native-browser",
                sources: result?.sources ?? [],
                latencyMs: Date.now() - start,
            };
        }
        catch (err) {
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
    async executeFetch(platform, url, signal) {
        const start = Date.now();
        const req = createBridgeRequest("source.fetch", { platform, url });
        try {
            const result = await this.server.sendRequest(req, 25000, signal);
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
        }
        catch (err) {
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
