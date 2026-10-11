import { type Socket } from "node:net";
import { type TLSSocket } from "node:tls";
/** Machine codes the transport raises (mapped to UI codes by the caller). */
export type TransportErrorCode = "invalid-url" | "destination-blocked" | "proxy-required" | "timeout" | "network" | "invalid-response" | "config" | "aborted";
export declare class TransportError extends Error {
    readonly code: TransportErrorCode;
    readonly status?: number;
    constructor(code: TransportErrorCode, message: string, status?: number);
}
/** True for any transport failure (already classified — never re-wrap). */
export declare function isTransportError(value: unknown): value is TransportError;
/**
 * How much the destination is trusted.
 *  - `official` — the adapter's own built-in endpoint. Trusted by definition;
 *    a loopback default (self-hosted SearXNG) is legitimate here.
 *  - `authorized` — an explicit operator authorization matched this host:port.
 *  - `public` — a user-typed address; must be a public host on https.
 */
export type DestinationTrust = "official" | "authorized" | "public";
/** One operator-granted outbound target. */
export interface OutboundAuthorization {
    /** Hostname, IP literal, or `.suffix` for a domain. */
    host: string;
    /** Exact port, or undefined for any port. */
    port?: number;
    /** Allow plain http (default: https only). */
    allowHttp?: boolean;
    /** Allow private/loopback/link-local resolved addresses. */
    allowPrivate?: boolean;
    /** Human note shown in diagnostics. */
    note?: string;
}
/** Operator policy for outbound provider requests. */
export interface OutboundPolicy {
    /** Granted targets. */
    authorizations: OutboundAuthorization[];
    /** Allow http:// for non-official destinations. Default false. */
    allowPublicHttp?: boolean;
    /** Whether proxied requests are permitted for this destination. */
    allowProxy?: boolean;
    /** Hard cap on response bytes (default 2 MiB). */
    maxResponseBytes?: number;
    /** Connect timeout in ms (default 10s). */
    connectTimeoutMs?: number;
    /** Request timeout in ms (default 15s). */
    requestTimeoutMs?: number;
}
export declare const DEFAULT_MAX_RESPONSE_BYTES: number;
/** Operator-granted outbound destinations (shared registry). */
export declare const OUTBOUND_AUTHORIZATIONS: OutboundAuthorization[];
/** Match a host against one authorization entry. */
export declare function hostMatchesAuthorization(host: string, entry: OutboundAuthorization): boolean;
/** The authorization covering this host:port, if any. */
export declare function findAuthorization(host: string, port: number, policy: OutboundPolicy): OutboundAuthorization | undefined;
/** Reject URL shapes that are never legitimate for a provider endpoint. */
export declare function assertEndpointUrl(rawUrl: string): URL;
/**
 * Validate one user-supplied header name.
 * @throws {TransportError} on a reserved or malformed name.
 */
export declare function assertHeaderName(name: string): void;
/** Upper bound on any single mapped string field. */
export declare const MAX_MAPPED_STRING_CHARS = 4000;
/**
 * Truncate at a Unicode-safe boundary.
 *
 * `String.prototype.slice` operates on UTF-16 code units, so a naive cut can
 * split a surrogate pair and leave a lone surrogate in the output (invalid
 * text that corrupts downstream JSON/tool contexts). This walks back off a
 * dangling high surrogate instead.
 */
export declare function truncateUnicodeSafe(value: string, maxChars?: number): string;
/** One resolved address record. */
export interface ResolvedAddress {
    address: string;
    family: number;
}
/** Injectable DNS resolver (tests never touch the network). */
export type LookupAllFn = (hostname: string) => Promise<ResolvedAddress[]>;
/**
 * Decide whether one resolved address may be connected to.
 *
 * `allowPrivate` is the single gate for loopback/RFC1918/link-local: it is true
 * only for a built-in provider's own official endpoint or for a host the
 * operator explicitly authorized with `allowPrivate`.
 *
 * @throws {TransportError} `destination-blocked` when it may not.
 */
export declare function assertAddressAllowed(address: string, allowPrivate: boolean): void;
/** Injectable socket connector (tests substitute a fake). */
export type ConnectFn = (options: {
    address: string;
    port: number;
    servername: string;
    useTls: boolean;
    timeoutMs: number;
    signal?: AbortSignal;
}) => Socket | TLSSocket;
/** Default connector: real TCP/TLS, pinned to one validated address. */
export declare const defaultConnect: ConnectFn;
/** One outbound provider request. */
export interface TransportRequest {
    url: string;
    method: "GET" | "POST";
    headers: Record<string, string>;
    /** Serialized request body (POST only). Never logged. */
    body?: string;
    /** Structural description for diagnostics — no secrets. */
    label: string;
    trust: DestinationTrust;
    policy: OutboundPolicy;
    signal?: AbortSignal;
    /**
     * Skip the public-address check for this request. Only the built-in adapters
     * set this, and only for their own hardcoded official endpoint.
     */
    builtInOfficial?: boolean;
}
/** One outbound provider response. */
export interface TransportResponse {
    status: number;
    ok: boolean;
    contentType: string;
    /** Parsed JSON when the body parsed; otherwise undefined. */
    json?: unknown;
    /** Raw text (bounded) when JSON parsing was attempted or content was text. */
    text: string;
    /** True when the body exceeded the cap and was truncated. */
    truncated: boolean;
    headers: Headers;
}
/** Injectable seams so tests never open a socket. */
export interface TransportDeps {
    lookupAll: LookupAllFn;
    connect: ConnectFn;
    /** Resolve a proxy URL, or undefined when no proxy is configured. */
    proxyUrl?: () => string | undefined;
    /** Build a dispatcher for a proxy URL (undici ProxyAgent). */
    proxyDispatcher?: (proxyUrl: string) => Promise<unknown>;
    /** Bound the whole request (tests inject an instant timer). */
    now: () => number;
}
/** Result of a DNS pre-flight (also used by the connect guard). */
export interface DnsPreflight {
    addresses: ResolvedAddress[];
    allowPrivate: boolean;
}
/**
 * Resolve and validate every candidate address for a destination.
 * @throws {TransportError} when any candidate is disallowed.
 */
export declare function preflightDns(hostname: string, trust: DestinationTrust, policy: OutboundPolicy, deps: Pick<TransportDeps, "lookupAll">): Promise<DnsPreflight>;
/**
 * Fetch one provider endpoint under an explicit outbound policy.
 *
 * @throws {TransportError} on any policy, DNS, network, or size violation.
 */
export declare function transact(request: TransportRequest, overrides?: Partial<TransportDeps>): Promise<TransportResponse>;
