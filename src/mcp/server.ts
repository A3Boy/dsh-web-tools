/**
 * dsh-web-tools — Model Context Protocol (MCP) Server.
 *
 * Exposes dsh-web-tools' multi-provider web search and web fetch engines
 * to external agent runtimes (Claude Code, Cursor, Windsurf, OpenCodeInterpreter, etc.)
 * over standard JSON-RPC 2.0 stdio transport.
 *
 * Supported tools:
 *  - web_search: Multi-provider search with fallback, topic detection, and adaptive routing.
 *  - web_fetch: Content extraction with anti-bot challenge fallback.
 *
 * @module
 */
import readline from "node:readline";
import { Readable } from "node:stream";
import { createSearchProvider, createFetchProvider, type WebSearchProviderLike, type WebFetchProviderLike } from "../host/registry.ts";
import { Stats } from "../host/stats.ts";
import type { SearchRoutingPolicy } from "../host/routing-policy.ts";
import { CURRENT_VERSION } from "../shared/version.ts";

/**
 * MCP protocol revisions this server understands, newest first. The server
 * answers `initialize` with the client's version when it is on this list and
 * with its own newest otherwise — echoing an arbitrary string would claim
 * support for a protocol we do not implement.
 */
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface McpServerOptions {
  env?: Record<string, string | undefined>;
  defaultProvider?: string;
  routingPolicy?: SearchRoutingPolicy;
  timeoutMs?: number;
  /** Hard ceiling for ONE tools/call (search or fetch). Default: 60s. */
  requestTimeoutMs?: number;
  inStream?: NodeJS.ReadableStream;
  outStream?: NodeJS.WritableStream;
  searchProvider?: WebSearchProviderLike;
  fetchProvider?: WebFetchProviderLike;
}

const ENV_KEY_MAPPINGS: Record<string, string[]> = {
  exa: ["EXA_API_KEY", "WEB_TOOLS_EXA", "WEB_TOOLS_EXA_KEY"],
  tavily: ["TAVILY_API_KEY", "WEB_TOOLS_TAVILY", "WEB_TOOLS_TAVILY_KEY"],
  brave: ["BRAVE_API_KEY", "WEB_TOOLS_BRAVE", "WEB_TOOLS_BRAVE_KEY"],
  serper: ["SERPER_API_KEY", "WEB_TOOLS_SERPER", "WEB_TOOLS_SERPER_KEY"],
  firecrawl: ["FIRECRAWL_API_KEY", "WEB_TOOLS_FIRECRAWL", "WEB_TOOLS_FIRECRAWL_KEY"],
  keenable: ["KEENABLE_API_KEY", "WEB_TOOLS_KEENABLE", "WEB_TOOLS_KEENABLE_KEY"],
  you: ["YOU_API_KEY", "WEB_TOOLS_YOU", "WEB_TOOLS_YOU_KEY"],
  jina: ["JINA_API_KEY", "WEB_TOOLS_JINA", "WEB_TOOLS_JINA_KEY"],
  parallel: ["PARALLEL_API_KEY", "WEB_TOOLS_PARALLEL", "WEB_TOOLS_PARALLEL_KEY"],
};

export class McpServer {
  private readonly searchProvider: WebSearchProviderLike;
  private readonly fetchProvider: WebFetchProviderLike;
  private readonly inStream: NodeJS.ReadableStream;
  private readonly outStream: NodeJS.WritableStream;
  private readonly requestTimeoutMs: number;
  private rl?: readline.Interface;

  constructor(options: McpServerOptions = {}) {
    const env = options.env ?? process.env;
    this.inStream = options.inStream ?? process.stdin;
    this.outStream = options.outStream ?? process.stdout;
    this.requestTimeoutMs = (() => {
      const raw = env.WEB_TOOLS_REQUEST_TIMEOUT_MS ? parseInt(env.WEB_TOOLS_REQUEST_TIMEOUT_MS, 10) : NaN;
      const fromEnv = Number.isFinite(raw) && raw > 0 ? raw : 60_000;
      const chosen = options.requestTimeoutMs ?? fromEnv;
      return Number.isFinite(chosen) && chosen > 0 ? chosen : 60_000;
    })();

    if (options.searchProvider && options.fetchProvider) {
      this.searchProvider = options.searchProvider;
      this.fetchProvider = options.fetchProvider;
      return;
    }

    const stats = new Stats();
    const defaultProvider = options.defaultProvider ?? env.WEB_TOOLS_DEFAULT_PROVIDER ?? "exa";
    const routingPolicy = (options.routingPolicy ?? env.WEB_TOOLS_ROUTING_POLICY ?? "adaptive") as SearchRoutingPolicy;
    const timeoutMs = options.timeoutMs ?? (env.WEB_TOOLS_TIMEOUT_MS ? parseInt(env.WEB_TOOLS_TIMEOUT_MS, 10) : 10000);

    const resolveConfig = () => ({
      enabled: true,
      defaultProvider,
      searchRoutingPolicy: routingPolicy,
      providerAttemptTimeoutMs: timeoutMs,
      fallbackOrder: ["exa", "tavily", "brave", "serper", "firecrawl", "keenable", "you", "jina", "parallel", "searxng"],
      providerBaseUrls: {
        searxng: env.SEARXNG_URL ?? env.WEB_TOOLS_SEARXNG_URL ?? "",
      },
      enabledProviders: {},
    });

    const resolveKeys = async (providerName: string): Promise<string> => {
      const candidates = ENV_KEY_MAPPINGS[providerName] ?? [];
      for (const k of candidates) {
        const val = env[k];
        if (val && val.trim().length > 0) return val.trim();
      }
      return "";
    };

    this.searchProvider = options.searchProvider ?? createSearchProvider(
      resolveConfig,
      resolveKeys,
      {
        record: (e) => stats.record({ ...e, at: Date.now() }),
        summary: () => stats.summary(),
      },
    );

    this.fetchProvider = options.fetchProvider ?? createFetchProvider(
      resolveConfig,
      resolveKeys,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        record: (e) => stats.record({ ...e, at: Date.now() }),
      },
    );
  }

  /** Start listening for JSON-RPC messages on the input stream. */
  start(): void {
    const rl = readline.createInterface({
      input: this.inStream as Readable,
      terminal: false,
    });
    this.rl = rl;

    rl.on("line", async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let msg: any;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        this.sendError(null, -32700, "Parse error");
        return;
      }

      await this.handleMessage(msg);
    });
  }

  /** Close the server and stop listening. */
  close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }
  }

  /**
   * Bound ONE tool call. A provider chain can legitimately spend several
   * per-attempt budgets in a row; without this ceiling a stalled backend would
   * leave the client's request hanging forever (and the agent waiting on it).
   */
  private async withDeadline<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    // Deliberately NOT unref'd: while a tool call is in flight the deadline is
    // the only thing guaranteeing the request settles, so it must keep the
    // process alive even if a backend stalls without any other handle open.
    const timer = setTimeout(
      () => controller.abort(new Error(`tool call timed out after ${this.requestTimeoutMs}ms`)),
      this.requestTimeoutMs,
    );
    try {
      // Race the deadline explicitly: a backend that ignores its abort signal
      // must not be able to hang the client's request.
      return await Promise.race([
        run(controller.signal),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(controller.signal.reason ?? new Error("tool call aborted")),
            { once: true },
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private sendResponse(id: string | number | null, result: any): void {
    if (id === null || id === undefined) return;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      result,
    });
    this.outStream.write(payload + "\n");
  }

  private sendError(id: string | number | null | undefined, code: number, message: string, data?: any): void {
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message, data },
    });
    this.outStream.write(payload + "\n");
  }

  private async handleMessage(msg: any): Promise<void> {
    const { id, method, params } = msg;

    if (!method || typeof method !== "string") {
      this.sendError(id, -32600, "Invalid Request");
      return;
    }

    // Notifications (no id)
    if (id === undefined || id === null) {
      if (method === "notifications/initialized") {
        // Client confirmed initialization
        return;
      }
      return;
    }

    switch (method) {
      case "initialize": {
        const requested = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
        const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0];
        this.sendResponse(id, {
          protocolVersion,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "dsh-web-tools-mcp",
            version: CURRENT_VERSION,
          },
        });
        break;
      }

      case "ping": {
        this.sendResponse(id, {});
        break;
      }

      case "tools/list": {
        this.sendResponse(id, {
          tools: [
            {
              name: "web_search",
              description:
                "Search the web using multiple integrated providers with resilient fallback, topic/country extraction, and adaptive routing.",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "The search query keywords or question.",
                  },
                  maxResults: {
                    type: "number",
                    description: "Maximum number of search results to retrieve (default: 5).",
                  },
                },
                required: ["query"],
              },
            },
            {
              name: "web_fetch",
              description:
                "Extract clean, readable Markdown content and metadata from a web page URL with anti-bot gate validation and multi-provider fallback.",
              inputSchema: {
                type: "object",
                properties: {
                  url: {
                    type: "string",
                    description: "The HTTP or HTTPS URL of the webpage to fetch.",
                  },
                },
                required: ["url"],
              },
            },
          ],
        });
        break;
      }

      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments ?? {};

        if (name === "web_search") {
          const query = String(args.query ?? "").trim();
          if (!query) {
            this.sendResponse(id, {
              isError: true,
              content: [{ type: "text", text: "Error: query parameter is required." }],
            });
            return;
          }

          const maxResults = typeof args.maxResults === "number" ? Math.max(1, Math.min(20, args.maxResults)) : 5;

          try {
            const res = await this.withDeadline((signal) =>
              this.searchProvider.search({ query, maxResults }, signal),
            );
            let formattedText = "";

            if (res.sources && res.sources.length > 0) {
              formattedText = res.sources
                .map((s, idx) => {
                  const title = s.title ? `[${s.title}](${s.url})` : s.url;
                  const snippet = s.snippet ? `\n   ${s.snippet}` : "";
                  const date = s.publishedAt ? ` (Published: ${s.publishedAt})` : "";
                  return `${idx + 1}. ${title}${date}${snippet}`;
                })
                .join("\n\n");
            } else if (res.content) {
              formattedText = res.content;
            } else {
              formattedText = `No results found for query: "${query}"`;
            }

            this.sendResponse(id, {
              content: [{ type: "text", text: formattedText }],
            });
          } catch (err: any) {
            this.sendResponse(id, {
              isError: true,
              content: [{ type: "text", text: `Search failed: ${err.message ?? String(err)}` }],
            });
          }
          break;
        }

        if (name === "web_fetch") {
          const url = String(args.url ?? "").trim();
          if (!url) {
            this.sendResponse(id, {
              isError: true,
              content: [{ type: "text", text: "Error: url parameter is required." }],
            });
            return;
          }

          try {
            const res = await this.withDeadline((signal) => this.fetchProvider.fetch({ url }, signal));
            const content = res.body?.content || "(No readable content extracted)";
            const headerParts = [
              res.metadata?.title ? `# ${res.metadata.title}` : "",
              res.metadata?.author ? `*Author: ${res.metadata.author}*` : "",
              res.metadata?.publishedAt ? `*Published: ${res.metadata.publishedAt}*` : "",
            ].filter(Boolean);

            const text = headerParts.length > 0 ? `${headerParts.join("\n")}\n\n${content}` : content;

            this.sendResponse(id, {
              content: [{ type: "text", text }],
            });
          } catch (err: any) {
            this.sendResponse(id, {
              isError: true,
              content: [{ type: "text", text: `Fetch failed: ${err.message ?? String(err)}` }],
            });
          }
          break;
        }

        this.sendResponse(id, {
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
        });
        break;
      }

      default:
        this.sendError(id, -32601, `Method not found: ${method}`);
        break;
    }
  }
}

/** CLI entrypoint helper for running the MCP server directly via stdio. */
export function runMcpServer(options: McpServerOptions = {}): McpServer {
  const server = new McpServer(options);
  server.start();
  return server;
}
