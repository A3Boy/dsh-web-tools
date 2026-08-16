/**
 * dsh-web-tools — structural service faces for the Host plugin.
 *
 * A third-party plugin resolves outside the DSH monorepo's single cordis
 * instance, so the upstream `declare module` augmentations do not reliably
 * reach this Context. Following the proven `dsh-better-sidebar` pattern, we
 * restate the runtime shapes we touch as structural mirrors. Node-free types
 * only (shared with the client graph).
 * @module
 */

/** HTTP request face route handlers see (subset of node IncomingMessage). */
export interface WebToolsHttpRequest {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>;
}

/** HTTP response face route handlers write to (subset of ServerResponse). */
export interface WebToolsHttpResponse {
  statusCode: number;
  writeHead(status: number, headers?: Record<string, string>): void;
  end(body?: string | Uint8Array): void;
}

/** One named webserver route (mirror of host-webserver WebRoute). */
export interface WebToolsWebRoute {
  kind: "exact" | "prefix";
  path: string;
  handler: (req: WebToolsHttpRequest, res: WebToolsHttpResponse) => void | Promise<void>;
}

/** The webServer service face this plugin uses. */
export interface WebToolsWebServer {
  register(route: WebToolsWebRoute): () => void;
}

/** The web runtime face (trusted hosts list for the browser fence). */
export interface WebToolsWebRuntime {
  trustedHosts: readonly string[];
}

/** The settings service face (mirror of dsh-settings SettingsProvider). */
export interface WebToolsSettingsService {
  register<T>(
    ns: string,
    schema: unknown,
    options?: { base?: Partial<T>; applies?: "live" | "restart" },
  ): {
    get(): T;
    watch(callback: (next: T, prev: T) => void | Promise<void>): () => void;
    update(patch: object): Promise<void>;
    replace(section: object): Promise<void>;
  };
  describe(options?: { redactSecrets?: boolean }): Array<{
    ns: string;
    value?: unknown;
    base?: unknown;
    user?: unknown;
    applies: "live" | "restart";
    revision: number;
  }>;
  update(ns: string, patch: object, expectedRevision?: number): Promise<void>;
}

/** The credentials service face (mirror of dsh-credentials). */
export interface WebToolsCredentialsService {
  resolve(ref: string): Promise<{ value?: string; source?: string } | undefined>;
  set(ref: string, value: string): Promise<void>;
  /** Remove a credential entirely (the provider refuses to store empty values). */
  unset(ref: string): Promise<void>;
  describe(refs: string[]): Promise<Record<string, { configured: boolean; source?: string; writable: boolean }>>;
}

/** The web seam face (mirror of dsh-web WebRuntime, search + fetch providers). */
export interface WebToolsWebSeam {
  registerSearchProvider(provider: {
    id: string;
    available(): boolean;
    search(request: { query: string; maxResults?: number }, signal?: AbortSignal): Promise<{
      content?: string;
      sources: Array<{ url: string; title?: string; snippet?: string; publishedAt?: string }>;
      truncated: boolean;
    }>;
  }): () => void;
  registerFetchProvider(provider: {
    id: string;
    available(): boolean;
    fetch(request: { url: string }, signal?: AbortSignal): Promise<{
      url: string;
      statusCode: number;
      body: { kind: "html" | "text"; content: string };
      truncated: boolean;
    }>;
  }): () => void;
}

/** The lifecycle helper face (DSH-vendored cordis `effect`). */
export interface WebToolsEffect {
  (fn: () => void | (() => void), label?: string): void;
}

/**
 * Our Context: structural mirrors of the services we consume. Deliberately a
 * standalone interface (not extending cordis Context): the vendored cordis
 * generic signatures (inject/effect) do not survive third-party resolution,
 * and we only touch the members below.
 */
export interface WebToolsContext {
  webServer: WebToolsWebServer;
  webRuntime: WebToolsWebRuntime;
  settings: WebToolsSettingsService;
  credentials: WebToolsCredentialsService;
  web: WebToolsWebSeam;
  /** DSH-vendored cordis lifecycle helper. */
  effect(fn: () => void | (() => void), label?: string): void;
  /** Cordis dependency injection (callback gets the scoped context). */
  inject(services: string[], callback: (ctx: WebToolsContext) => void): unknown;
}

