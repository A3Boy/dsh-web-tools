/**
 * dsh-web-tools — Host Bridge Protocol & Message Helpers.
 */
import { randomUUID } from "node:crypto";
import type { SpecializedPlatformId } from "./types.ts";

export interface BridgeRequest<T = unknown> {
  id: string;
  kind: string;
  payload?: T;
}

export interface BridgeResponse<T = unknown> {
  id: string;
  kind: "result" | "error" | "pong" | "auth.changed";
  payload?: T;
  error?: {
    code: string;
    message: string;
  };
}

export function createBridgeRequest<T>(kind: string, payload?: T): BridgeRequest<T> {
  return {
    id: randomUUID(),
    kind,
    payload,
  };
}
