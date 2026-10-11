/**
 * dsh-web-tools — server-side validation for custom search sources.
 *
 * Every field crossing the `/web-tools/api` boundary passes through here before
 * it is persisted or dialed. The rules exist to keep a custom source a
 * *declarative search client* and never a general-purpose request tool:
 *
 *  - the endpoint is an absolute http(s) URL with no userinfo/query/fragment;
 *  - `searchPath` is relative (an absolute URL there would let a caller point
 *    the credential at a host that the base-URL policy never authorized);
 *  - mapping paths are plain dotted identifiers or numeric indexes — no
 *    expressions, functions, or prototype-walking keys;
 *  - `staticParams` is a bounded flat map of primitives.
 *
 * @module
 */
import { type AuthMode, type CustomCredentialRefs, type CustomEndpointConfig, type CustomProviderConfig, type CustomProtocol, type CustomProviderDraft, type CustomRequestConfig, type CustomResponseConfig } from "../shared/custom-provider-types.ts";
/** Thrown for any invalid field; `path` names the offending field. */
export declare class CustomProviderValidationError extends Error {
    readonly code: "config";
    readonly path: string;
    constructor(path: string, message: string);
}
/** One segment of a restricted mapping path. */
type PathSegment = string | number;
/**
 * Parse a restricted dotted path into segments.
 *
 * Accepted: `results`, `data.results`, `data.0.items`, `0.url`.
 * Rejected: anything with brackets, whitespace, quotes, expressions, empty
 * segments, or a forbidden member name.
 *
 * @throws {CustomProviderValidationError}
 */
export declare function parseMappingPath(path: string, field: string, allowEmpty?: boolean): PathSegment[];
/**
 * Read one value out of a parsed JSON document by a restricted path.
 * Only own properties are read, and only one level is descended per segment —
 * there is no evaluation of any kind.
 */
export declare function readMappingPath(root: unknown, segments: readonly PathSegment[]): unknown;
/**
 * Validate a base URL: absolute http(s), no userinfo, no query, no fragment.
 * A query or fragment in a *base* is always an operator mistake and a good way
 * to smuggle unexpected parameters past the request builder.
 */
export declare function validateBaseUrl(value: unknown, field?: string): string;
/** Validate `searchPath`: relative, no scheme, no query, no traversal. */
export declare function validateSearchPath(value: unknown, field?: string): string;
/** Validate the endpoint block. */
export declare function validateEndpoint(value: unknown): CustomEndpointConfig;
/** Validate the auth block. */
export declare function validateAuth(value: unknown): CustomProviderConfig["auth"];
/** Validate the optional request-mapping block. */
export declare function validateRequest(value: unknown, protocol: CustomProtocol): CustomRequestConfig | undefined;
/** Validate `staticParams`: flat, bounded, primitives only. */
export declare function validateStaticParams(value: unknown): Record<string, string | number | boolean> | undefined;
/** Validate the response-mapping block, falling back to protocol defaults. */
export declare function validateResponse(value: unknown, protocol: CustomProtocol): CustomResponseConfig;
/** Validate a protocol id. */
export declare function validateProtocol(value: unknown): CustomProtocol;
/**
 * Validate a host-generated source id.
 * Only ids matching the host's own format are ever accepted from a client, so
 * a caller cannot make the host derive a credential ref of its choosing.
 */
export declare function validateSourceId(value: unknown): string;
/**
 * Validate a full draft coming from the editor (no id or revision yet).
 * @throws {CustomProviderValidationError}
 */
export declare function validateDraft(value: unknown, sourceField?: string): CustomProviderDraft;
/** Validate a persisted config read back from settings (defensive on load). */
export declare function validateStoredConfig(value: unknown): CustomProviderConfig | undefined;
/**
 * Load and sanitize the persisted custom-provider list.
 * A single malformed entry is dropped rather than failing the whole load, so
 * a bad hand-edit cannot make the plugin unavailable.
 */
export declare function loadCustomProviders(value: unknown, limit?: number): CustomProviderConfig[];
/**
 * Credential refs for one custom source. Host-derived from the source id, so a
 * client can never name an arbitrary credential ref.
 *
 * `basic` uses two refs rather than the legacy `user:password` joined string:
 * the shared pool splits on `,`, `;` and whitespace, which would corrupt a
 * password containing any of those characters.
 */
export declare function credentialRefsOf(sourceId: string, mode: AuthMode): CustomCredentialRefs;
/** Every credential ref that must be cleaned up when a source is deleted. */
export declare function allCredentialRefsOf(sourceId: string): string[];
/** Generate a host-owned, never-reused source id. */
export declare function generateSourceId(existing: readonly string[], random?: () => number): string;
export {};
