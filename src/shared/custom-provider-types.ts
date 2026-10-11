/**
 * dsh-web-tools — Custom Search Provider contract (Issue #9).
 *
 * A custom provider is a *declarative* description of one JSON search service:
 * how to reach it, how to authenticate, and how to map its response into the
 * normalized `SearchOutcome`. Nothing here is executable — no user-supplied
 * script, expression, or dynamic property access is ever evaluated.
 *
 * Two identifiers are deliberately kept separate:
 *  - `sourceId`  — one configured source instance (`custom_ab12cd34`). Owns its
 *                  credential, key pool, health and routing slot.
 *  - `protocol`  — how to speak to it (`tavily-compatible`, `searxng-json`,
 *                  `generic-json`). Only chooses the request/response codec.
 *
 * Several sources may share a protocol without sharing any runtime state.
 *
 * @module
 */

/** Wire protocol a custom source speaks. */
export type CustomProtocol = "tavily-compatible" | "searxng-json" | "generic-json";

/** How credentials are attached to an outbound request. */
export type AuthMode = "none" | "bearer" | "api-key-header" | "basic";

/** HTTP verb a custom source accepts. */
export type CustomMethod = "GET" | "POST";

/** How request parameters are transported. */
export type CustomEncoding = "query" | "json" | "form";

/** Maximum custom sources persisted in one profile. */
export const MAX_CUSTOM_PROVIDERS = 20;

/** Prefix every host-generated custom source id carries. */
export const CUSTOM_ID_PREFIX = "custom_";

/** Credential refs one custom source may own (see credentialRefsOf). */
export interface CustomCredentialRefs {
  /** Primary key/token ref — present unless auth is `basic` or `none`. */
  key?: string;
  /** Basic-auth username ref. */
  username?: string;
  /** Basic-auth password ref. */
  password?: string;
}

/** Endpoint description. */
export interface CustomEndpointConfig {
  /** Absolute http(s) origin, optionally with a path prefix (e.g. `/v2`). */
  baseUrl: string;
  /** Path relative to `baseUrl`. Must not be an absolute URL. */
  searchPath: string;
  method: CustomMethod;
  encoding: CustomEncoding;
}

/** Authentication description (never contains the secret itself). */
export interface CustomAuthConfig {
  mode: AuthMode;
  /** Header name for `api-key-header`. Required for that mode only. */
  headerName?: string;
}

/** Request-side mapping (generic-json and searxng-json overrides). */
export interface CustomRequestConfig {
  /** Field/parameter carrying the query text. */
  queryField: string;
  /** Field/parameter carrying the result limit. Omit to not send one. */
  limitField?: string;
  /** Extra static parameters merged into every request. */
  staticParams?: Record<string, string | number | boolean>;
}

/** Response-side mapping: restricted dot paths or numeric indexes. */
export interface CustomResponseConfig {
  /** Path to the result array, e.g. `data.results`. */
  itemsPath: string;
  /** Path to a result's URL, relative to one item. */
  urlPath: string;
  titlePath?: string;
  snippetPath?: string;
  publishedAtPath?: string;
  /** Path to a top-level answer/summary string. */
  answerPath?: string;
}

/** One persisted custom search source. */
export interface CustomProviderConfig {
  /** Schema version for forward migration. */
  schemaVersion: 1;
  /** Host-generated, immutable, never reused. */
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  protocol: CustomProtocol;
  endpoint: CustomEndpointConfig;
  auth: CustomAuthConfig;
  request?: CustomRequestConfig;
  response?: CustomResponseConfig;
  /**
   * Optimistic-concurrency revision. Bumped by the host on every successful
   * update so a stale editor cannot silently overwrite a newer save.
   */
  revision: number;
}

/** The client-supplied half of a create request (no id/revision). */
export type CustomProviderDraft = Omit<CustomProviderConfig, "id" | "revision" | "schemaVersion">;

/** Per-protocol defaults the editor pre-fills and the schema validates against. */
export interface ProtocolDefaults {
  method: CustomMethod;
  encoding: CustomEncoding;
  searchPath: string;
  queryField: string;
  limitField?: string;
  response: CustomResponseConfig;
}

export const PROTOCOL_DEFAULTS: Record<CustomProtocol, ProtocolDefaults> = {
  "tavily-compatible": {
    method: "POST",
    encoding: "json",
    searchPath: "/search",
    queryField: "query",
    limitField: "max_results",
    response: { itemsPath: "results", urlPath: "url", titlePath: "title", snippetPath: "content", publishedAtPath: "published_date", answerPath: "answer" },
  },
  "searxng-json": {
    method: "GET",
    encoding: "query",
    searchPath: "/search",
    queryField: "q",
    response: { itemsPath: "results", urlPath: "url", titlePath: "title", snippetPath: "content", publishedAtPath: "publishedDate", answerPath: "answer" },
  },
  "generic-json": {
    method: "GET",
    encoding: "query",
    searchPath: "/search",
    queryField: "q",
    limitField: "limit",
    response: { itemsPath: "results", urlPath: "url", titlePath: "title", snippetPath: "snippet" },
  },
};

/** Human labels for the protocol picker. */
export const PROTOCOL_LABELS: Record<CustomProtocol, string> = {
  "tavily-compatible": "Tavily Compatible",
  "searxng-json": "SearXNG JSON",
  "generic-json": "Generic JSON",
};

/** Stable, UI-facing error codes for every source-management operation. */
export type CustomSourceErrorCode =
  | "invalid-url"
  | "destination-blocked"
  | "auth"
  | "timeout"
  | "network"
  | "invalid-response"
  | "mapping-error"
  | "config"
  | "conflict"
  | "not-found";

/** Result shape of `sources/test` (draft or saved). */
export interface CustomSourceTestView {
  ok: boolean;
  status?: "connected";
  latencyMs?: number;
  resultCount?: number;
  results?: Array<{ title: string; url: string; snippet?: string }>;
  /** Non-fatal mapping diagnostics (e.g. items dropped for missing URLs). */
  warnings?: string[];
  error?: { code: CustomSourceErrorCode; message: string };
}
