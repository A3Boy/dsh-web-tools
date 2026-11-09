import { type WebSearchProviderLike, type WebFetchProviderLike } from "../host/registry.ts";
import type { SearchRoutingPolicy } from "../host/routing-policy.ts";
export interface McpServerOptions {
    env?: Record<string, string | undefined>;
    defaultProvider?: string;
    routingPolicy?: SearchRoutingPolicy;
    timeoutMs?: number;
    inStream?: NodeJS.ReadableStream;
    outStream?: NodeJS.WritableStream;
    searchProvider?: WebSearchProviderLike;
    fetchProvider?: WebFetchProviderLike;
}
export declare class McpServer {
    private readonly searchProvider;
    private readonly fetchProvider;
    private readonly inStream;
    private readonly outStream;
    private rl?;
    constructor(options?: McpServerOptions);
    /** Start listening for JSON-RPC messages on the input stream. */
    start(): void;
    /** Close the server and stop listening. */
    close(): void;
    private sendResponse;
    private sendError;
    private handleMessage;
}
/** CLI entrypoint helper for running the MCP server directly via stdio. */
export declare function runMcpServer(options?: McpServerOptions): McpServer;
