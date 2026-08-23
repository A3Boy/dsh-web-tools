/**
 * dsh-web-tools — Browser Bridge Shared Protocol Definition.
 *
 * Types for bidirectional communication between DSH Host and MV3 Extension.
 */

export type BridgeMessageKind =
  // Host -> Extension
  | "ping"
  | "auth.status"
  | "auth.connect"
  | "source.search"
  | "source.fetch"
  | "cancel"
  // Extension -> Host
  | "hello"
  | "pong"
  | "auth.changed"
  | "result"
  | "error";

export interface BridgeBaseMessage {
  id: string; // UUID
  kind: BridgeMessageKind;
}

// 1. Handshake & Pairing
export interface HostHelloResponse extends BridgeBaseMessage {
  kind: "result";
  payload: {
    paired: boolean;
    bridgeKey?: string;
  };
}

export interface ExtensionHelloMessage extends BridgeBaseMessage {
  kind: "hello";
  payload: {
    ticket?: string;
    bridgeKey?: string;
    extensionVersion: string;
  };
}

// 2. Auth Messages
export interface HostAuthStatusRequest extends BridgeBaseMessage {
  kind: "auth.status";
  payload: {
    platform: "xiaohongshu" | "x";
  };
}

export interface HostAuthConnectRequest extends BridgeBaseMessage {
  kind: "auth.connect";
  payload: {
    platform: "xiaohongshu" | "x";
  };
}

export interface ExtensionAuthChangedNotice extends BridgeBaseMessage {
  kind: "auth.changed";
  payload: {
    platform: "xiaohongshu" | "x";
    authenticated: boolean;
    accountLabel?: string;
    accountId?: string;
    avatarUrl?: string;
    error?: string;
  };
}

// 3. Search & Fetch Messages
export interface HostSourceSearchRequest extends BridgeBaseMessage {
  kind: "source.search";
  payload: {
    platform: "xiaohongshu" | "x";
    query: string;
    maxResults?: number;
    options?: Record<string, unknown>;
  };
}

export interface HostSourceFetchRequest extends BridgeBaseMessage {
  kind: "source.fetch";
  payload: {
    platform: "xiaohongshu" | "x";
    url: string;
  };
}

export interface ExtensionResultMessage extends BridgeBaseMessage {
  kind: "result";
  payload: unknown;
}

export interface ExtensionErrorMessage extends BridgeBaseMessage {
  kind: "error";
  error: {
    code: string;
    message: string;
  };
}

export type BridgeHostMessage =
  | BridgeBaseMessage
  | HostAuthStatusRequest
  | HostAuthConnectRequest
  | HostSourceSearchRequest
  | HostSourceFetchRequest;

export type BridgeExtensionMessage =
  | ExtensionHelloMessage
  | ExtensionAuthChangedNotice
  | ExtensionResultMessage
  | ExtensionErrorMessage;
