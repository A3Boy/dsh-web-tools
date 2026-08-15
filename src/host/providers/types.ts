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

/** Classified failure raised by adapters (never thrown raw). */
export interface ProviderError extends Error {
  /** Machine code: auth | bad-request | rate-limit | timeout | server | network | unavailable | config */
  code: string;
  /** Original HTTP status when applicable. */
  status?: number;
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

/** One configured adapter instance. */
export interface ProviderAdapter extends ProviderMeta {
  /**
   * Run one search through this backend.
   * @param query
   * @param maxResults
   * @param apiKeyPool the pool entries for this provider (may be empty for keyless self-hosted).
   * @param baseUrl
   * @param signal
   */
  search(query: string, maxResults: number, apiKey: string, baseUrl: string | undefined, signal?: AbortSignal): Promise<SearchOutcome>;
  /**
   * Fetch one URL's text content through this backend (when fetchCapable).
   * @throws ProviderError when unsupported.
   */
  fetch(url: string, apiKey: string, baseUrl: string | undefined, signal?: AbortSignal): Promise<{ text: string }>;
}

/** Build a ProviderError with a classification code. */
export function providerError(code: string, message: string, status?: number): ProviderError {
  const err = new Error(message) as ProviderError;
  err.code = code;
  if (status !== undefined) err.status = status;
  return err;
}
