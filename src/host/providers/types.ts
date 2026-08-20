/**
 * dsh-web-tools — provider adapter contract.
 *
 * Each adapter implements search (and optionally fetch) for one backend,
 * normalized to DSH's `WebSearchResult` shape. Adapters own their HTTP
 * calls and SSRF guards; the registry owns pools and fallback.
 * @module
 */

/** Normalized source (mirrors DSH WebSearchSource). */
export interface Source {
  url: string;
  title?: string;
  snippet?: string;
  publishedAt?: string;
}

/** Normalized search outcome (mirrors DSH WebSearchResult). */
export interface SearchOutcome {
  content?: string;
  sources: Source[];
}

/** Machine classification of a provider failure (closed union). */
export type ProviderErrorCode =
  | "auth"
  | "quota"
  | "bad-request"
  | "rate-limit"
  | "timeout"
  | "server"
  | "network"
  | "config"
  | "aborted"
  | "invalid-response";

/** Classified failure raised by adapters (never thrown raw). */
export interface ProviderError extends Error {
  /** Machine code from {@link ProviderErrorCode}. */
  code: ProviderErrorCode;
  /** Original HTTP status when applicable. */
  status?: number;
  /** Server-requested cooldown in ms (from Retry-After header, 429 only). */
  retryAfterMs?: number;
  /** Upstream request ID for diagnostics. */
  requestId?: string;
}

/**
 * Classify an HTTP status uniformly across every adapter. Single source of
 * truth for fallback semantics; adapters must NOT hand-roll their own mapping.
 */
export function classifyHttpStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "quota";
  if (status === 408) return "timeout";
  if (status === 429) return "rate-limit";
  if (status >= 500) return "server";
  return "bad-request";
}

/** Adapter metadata (static). */
export interface ProviderMeta {
  /** Stable id used in config/credentials/UI ("tavily"). */
  name: string;
  label: string;
  /** Human description shown in the settings card. */
  description: string;
  /** Credential ref suffix (TAVILY → WEB_TOOLS_TAVILY). */
  credSuffix: string;
  /** Whether the backend supports native fetch (正文抽取). */
  fetchCapable: boolean;
  /** Needs a base URL (self-hosted like SearXNG) vs hosted. */
  needsBaseUrl: boolean;
  /** Default base URL when self-hosted. */
  defaultBaseUrl?: string;
}

/**
 * Per-execution context passed to provider search / fetch adapters.
 * Encapsulates the cancellation signal and any user-configured options
 * for this specific provider (no universal cross-provider parameters).
 */
export interface ProviderExecutionContext<TOptions = unknown> {
  readonly signal?: AbortSignal;
  readonly options?: Readonly<TOptions>;
}

/** One configured adapter instance. */
export interface ProviderAdapter extends ProviderMeta {
  /**
   * Run one search through this backend.
   * @param query
   * @param maxResults
   * @param apiKey
   * @param baseUrl
   * @param contextOrSignal optional execution context with typed options and signal, or bare signal
   */
  search(
    query: string,
    maxResults: number,
    apiKey: string,
    baseUrl: string | undefined,
    contextOrSignal?: AbortSignal | ProviderExecutionContext,
  ): Promise<SearchOutcome>;
  /**
   * Fetch one URL's text content through this backend (when fetchCapable).
   * @throws ProviderError when unsupported.
   */
  fetch(
    url: string,
    apiKey: string,
    baseUrl: string | undefined,
    contextOrSignal?: AbortSignal | ProviderExecutionContext,
  ): Promise<{ text: string }>;
}

/** Helper to extract signal and typed options from an execution context or bare signal. */
export function resolveContext<T = unknown>(contextOrSignal?: AbortSignal | ProviderExecutionContext<T>): {
  signal?: AbortSignal;
  options?: Readonly<T>;
} {
  if (!contextOrSignal) return {};
  if (typeof contextOrSignal === "object" && ("aborted" in contextOrSignal || "addEventListener" in contextOrSignal)) {
    return { signal: contextOrSignal as AbortSignal };
  }
  const ctx = contextOrSignal as ProviderExecutionContext<T>;
  return {
    signal: ctx.signal,
    options: ctx.options,
  };
}

export const extractContext = resolveContext;

/**
 * Self-hosted provider that needs a base URL and has no Fetch API — and
 * therefore works WITHOUT an API key (currently only SearXNG). Keyed-hosted
 * providers always require a key.
 */
export function isKeylessSelfHosted(meta: Pick<ProviderMeta, "needsBaseUrl" | "fetchCapable">): boolean {
  return meta.needsBaseUrl && !meta.fetchCapable;
}

/** Build a ProviderError with a classification code and optional retry-after metadata. */
export function providerError(code: ProviderErrorCode, message: string, status?: number, retryAfterMs?: number): ProviderError {
  const err = new Error(message) as ProviderError;
  err.code = code;
  if (status !== undefined) err.status = status;
  if (retryAfterMs !== undefined && retryAfterMs > 0) err.retryAfterMs = retryAfterMs;
  return err;
}

/**
 * Parse the `Retry-After` response header into milliseconds from now.
 * Supports:
 *  - `Retry-After: 30` (delta-seconds)
 *  - `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT` (HTTP-date)
 * Returns undefined when the header is absent or unparseable.
 */
export function parseRetryAfter(res: Response, now = Date.now()): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // Try delta-seconds first
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  // Try HTTP-date
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed - now);
  }
  return undefined;
}

/**
 * Throw a classified ProviderError from a non-OK HTTP response, with a
 * provider label for the message. Every adapter uses this — no per-adapter
 * status mapping. Retry-After header is parsed and attached to rate-limit errors.
 */
export function throwIfHttp(label: string, res: Response): void {
  if (res.ok) return;
  const code = classifyHttpStatus(res.status);
  const retryAfterMs = code === "rate-limit" ? parseRetryAfter(res) : undefined;
  throw providerError(code, `${label} failed (HTTP ${res.status}, ${code})`, res.status, retryAfterMs);
}
