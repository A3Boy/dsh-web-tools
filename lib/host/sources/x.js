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
import { BridgeClient, defaultBridgeClient } from "./bridge-client.js";
export class XSource {
    id = "x";
    bridgeClient;
    constructor(bridgeClient = defaultBridgeClient) {
        this.bridgeClient = bridgeClient;
    }
    async probe() {
        return this.bridgeClient.probeStatus("x");
    }
    async search(request, signal) {
        return this.bridgeClient.executeSearch("x", request, signal);
    }
    async fetch(url, signal) {
        return this.bridgeClient.executeFetch("x", url, signal);
    }
}
/** Default Twitter / X Source instance */
export const defaultXSource = new XSource();
