export declare class FetchSecurityError extends Error {
    readonly code: "WEB_INVALID_URL" | "WEB_FETCH_BLOCKED";
    constructor(code: "WEB_INVALID_URL" | "WEB_FETCH_BLOCKED", message: string);
}
/**
 * Check if an IPv4 address falls within private, loopback, or link-local ranges.
 */
export declare function isPrivateOrRestrictedIpv4(ip: string): boolean;
/**
 * Check if an IPv6 address falls within private, loopback, or link-local ranges.
 */
export declare function isPrivateOrRestrictedIpv6(ip: string): boolean;
/**
 * Check if a raw IP address (v4 or v6) is private or restricted.
 */
export declare function isPrivateOrRestrictedIp(ip: string): boolean;
/**
 * Validates a target URL structure before fetching to ensure it is a safe public HTTP/HTTPS URL.
 * Throws FetchSecurityError if invalid or blocked.
 */
export declare function validateFetchUrl(rawUrl: string): URL;
/** Injectable DNS lookup function signature. */
export type DnsLookupFn = (hostname: string, options: {
    all: true;
}) => Promise<Array<{
    address: string;
    family: number;
}>>;
/**
 * Resolves the hostname via DNS and verifies that all resolved A and AAAA addresses
 * point to public IP spaces. Prevents DNS rebinding and private IP domain spoofing.
 */
export declare function validateFetchDns(hostname: string, lookupFn?: DnsLookupFn, signal?: AbortSignal): Promise<void>;
