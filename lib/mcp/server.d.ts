import { type WebSearchProviderLike, type WebFetchProviderLike } from "../host/registry.ts";
import type { SearchRoutingPolicy } from "../host/routing-policy.ts";
import { SpecializedSourceRegistry } from "../host/sources/registry.ts";
import type { NativeBrowserRuntime } from "../host/browser/types.ts";
import { type RetrievalStrategy } from "../shared/api-types.ts";
export interface McpServerOptions {
    env?: Record<string, string | undefined>;
    defaultProvider?: string;
    routingPolicy?: SearchRoutingPolicy;
    retrievalStrategy?: RetrievalStrategy;
    timeoutMs?: number;
    /** Hard ceiling for ONE tools/call (search or fetch). Default: 60s. */
    requestTimeoutMs?: number;
    inStream?: NodeJS.ReadableStream;
    outStream?: NodeJS.WritableStream;
    searchProvider?: WebSearchProviderLike;
    fetchProvider?: WebFetchProviderLike;
    sourceRegistry?: SpecializedSourceRegistry;
    nativeRuntime?: NativeBrowserRuntime;
}
export declare class McpServer {
    private readonly searchProvider;
    private readonly fetchProvider;
    private readonly inStream;
    private readonly outStream;
    private readonly requestTimeoutMs;
    private nativeRuntime?;
    private rl?;
    constructor(options?: McpServerOptions);
    /** Start listening for JSON-RPC messages on the input stream. */
    start(): void;
    /** Close the server and stop listening. */
    close(): Promise<void>;
    /**
     * Bound ONE tool call. A provider chain can legitimately spend several
     * per-attempt budgets in a row; without this ceiling a stalled backend would
     * leave the client's request hanging forever (and the agent waiting on it).
     */
    private withDeadline;
    private sendResponse;
    private sendError;
    private handleMessage;
}
/** CLI entrypoint helper for running the MCP server or executing CLI commands. */
export declare function runMcpServer(options?: McpServerOptions): Promise<McpServer | undefined>;
