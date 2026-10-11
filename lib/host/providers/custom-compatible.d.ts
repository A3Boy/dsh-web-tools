import { TransportError, type DestinationTrust, type OutboundPolicy, type TransportRequest, type TransportResponse } from "../provider-transport.ts";
import { type ProviderAdapter, type Source } from "./types.ts";
import { type CustomProviderConfig, type CustomSourceErrorCode } from "../../shared/custom-provider-types.ts";
/** Credential access the adapters need (implemented by the host credentials service). */
export interface CredentialSource {
    /** Raw stored value, or "" when unset. */
    read(ref: string): Promise<string>;
}
/** Perform one outbound request under the transport's policy. */
export type TransportFn = (request: TransportRequest) => Promise<TransportResponse>;
/** Everything a custom adapter needs. */
export interface CustomAdapterDeps {
    transport: TransportFn;
    credentials: CredentialSource;
    /** Credential refs owned by this source (host-derived). */
    refs: {
        key?: string;
        username?: string;
        password?: string;
    };
    /** Outbound policy applied to this source's endpoint. */
    policy: OutboundPolicy;
    /** How much the configured endpoint is trusted. */
    trust: DestinationTrust;
}
/** Map a transport failure onto a stable, UI-facing source error code. */
export declare function toSourceErrorCode(code: TransportError["code"]): CustomSourceErrorCode;
/**
 * Translate a UI-facing source code into the executor's ProviderErrorCode.
 * Kept explicit so fallback semantics (`auth` indicts a key, `rate-limit`
 * cools down) stay driven by the executor's own vocabulary.
 */
export declare function providerCodeFor(code: CustomSourceErrorCode): "auth" | "bad-request" | "timeout" | "network" | "config" | "invalid-response";
/** A built request ready for the transport. */
export interface BuiltRequest {
    url: string;
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
}
/** Basic-auth header value (password may contain `:`, `,`, `;` — no splitting). */
export declare function basicAuthHeader(username: string, password: string): string;
/**
 * Build the outbound request for one custom source.
 *
 * Encoding rules:
 *  - `query` → parameters in the query string (any method).
 *  - `json`  → parameters as a JSON body (POST; a GET would put the query in
 *              the URL, which is allowed but unusual — POST is used instead).
 *  - `form`  → `application/x-www-form-urlencoded` body (POST).
 *
 * The credential NEVER enters the query string for custom sources. The one
 * legacy exception in this codebase is the built-in SearXNG adapter's
 * `api_key` parameter, which predates this module and lives in its own file.
 */
export declare function buildCustomRequest(config: CustomProviderConfig, deps: Pick<CustomAdapterDeps, "credentials" | "refs">, query: string, maxResults: number | undefined): Promise<BuiltRequest>;
/** Outcome of mapping one response document. */
export interface MappedResponse {
    content?: string;
    sources: Source[];
    warnings: string[];
}
/** Distinguish a zero-result page from a structurally wrong one. */
export declare function mapCustomResponse(config: CustomProviderConfig, json: unknown, maxResults?: number): MappedResponse;
/** Accept only absolute http(s) result URLs. */
export declare function normalizeResultUrl(value: unknown): string | undefined;
/** Build a ProviderAdapter for one persisted custom source. */
export declare function createCustomAdapter(config: CustomProviderConfig, deps: CustomAdapterDeps): ProviderAdapter;
