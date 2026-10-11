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
export type { OutboundAuthorization } from "../shared/custom-provider-types.ts";
import type { OutboundAuthorization } from "../shared/custom-provider-types.ts";
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
/** Update global outbound authorizations from live settings. */
export declare function setGlobalOutboundAuthorizations(auths: readonly OutboundAuthorization[]): void;
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
export declare const defaultLookupAll: LookupAllFn;
/**
 * Asynchronously probe whether a hostname resolves to private/loopback/restricted IP addresses.
 * Returns true if any candidate A/AAAA record is private/loopback/restricted.
 * Returns false for public IPs or on lookup failure.
 */
export declare function resolvesToPrivateIp(hostname: string, lookupAll?: LookupAllFn): Promise<boolean>;
/**
 * Unconditionally blocked destination check for cloud instance metadata and link-local addresses.
 *
 * Covers:
 *  - 169.254.0.0/16 (IPv4 link-local & cloud metadata e.g. AWS/Azure/GCP 169.254.169.254)
 *  - fe80::/10 (IPv6 link-local unicast: fe80:: through febf::, including fe80::1, fe90::1, etc.)
 *  - IPv4-mapped IPv6 forms of 169.254.0.0/16:
 *      * Dotted-decimal: ::ffff:169.254.x.x, 0:0:0:0:0:ffff:169.254.x.x
 *      * Hexadecimal: ::ffff:a9fe:xxxx, 0:0:0:0:0:ffff:a9fe:xxxx (where 169.254 in hex is 0xa9fe)
 *  - fd00:ec2::254 (IMDSv6)
 *
 * This check is absolute and invariant: even if the operator explicitly authorizes a private
 * network with `allowPrivate: true`, these targets are NEVER permitted.
 */
export declare function isCloudMetadataOrLinkLocal(address: string): boolean;
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
/** Build an undici dispatcher whose connections are pinned to one address. */
export declare function createPinnedDispatcher(options: {
    address: string;
    port: number;
    servername: string;
    useTls: boolean;
    connectTimeoutMs: number;
    connect: ConnectFn;
    signal: AbortSignal;
}): Promise<unknown>;
export declare function isLoopbackHost(hostname: string): boolean;
/**
 * Whether a URL targets the loopback host. Loopback targets are always dialed
 * directly (never through a proxy): there is no DNS rebinding concern and a
 * local instance must not be tunneled to an ambient internet proxy.
 */
export declare function isLoopbackUrl(urlStr: string): boolean;
/**
 * Whether a hostname is an IP literal in private/loopback space or a named local domain.
 * Normal public domain names (e.g. example.com, api.tavily.com) return false.
 */
export declare function isLocalOrPrivateHost(hostname: string): boolean;
