/**
 * dsh-web-tools — Host Bridge Protocol & Message Helpers.
 */
import { randomUUID } from "node:crypto";
export function createBridgeRequest(kind, payload) {
    return {
        id: randomUUID(),
        kind,
        payload,
    };
}
