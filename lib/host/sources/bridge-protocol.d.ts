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
export declare function createBridgeRequest<T>(kind: string, payload?: T): BridgeRequest<T>;
