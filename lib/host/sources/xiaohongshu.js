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
import { BridgeClient, defaultBridgeClient } from "./bridge-client.js";
export class XiaohongshuSource {
    id = "xiaohongshu";
    bridgeClient;
    constructor(bridgeClient = defaultBridgeClient) {
        this.bridgeClient = bridgeClient;
    }
    async probe() {
        return this.bridgeClient.probeStatus("xiaohongshu");
    }
    async search(request, signal) {
        return this.bridgeClient.executeSearch("xiaohongshu", request, signal);
    }
    async fetch(url, signal) {
        return this.bridgeClient.executeFetch("xiaohongshu", url, signal);
    }
}
/** Default Xiaohongshu Source instance */
export const defaultXiaohongshuSource = new XiaohongshuSource();
