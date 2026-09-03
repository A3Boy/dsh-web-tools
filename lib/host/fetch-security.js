/**
 * dsh-web-tools — SSRF & URL security validation.
 *
 * Validates public web fetch URLs against SSRF (Server-Side Request Forgery)
 * and DNS rebinding risks before network access and across manual HTTP redirects.
 *
 * Defends against:
 *  - non-HTTP protocols (file:, ftp:, gopher:, ws:, data:, javascript:, etc.)
 *  - userinfo credentials in URLs (e.g. https://user:pass@example.com)
 *  - loopback addresses (localhost, 127.0.0.0/8, ::1, 0.0.0.0, etc.)
 *  - link-local & cloud metadata (169.254.0.0/16, fe80::/10)
 *  - RFC1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 *  - unique local IPv6 (fc00::/7)
 *  - special suffixes (*.local, *.internal, *.lan, *.localhost)
 *  - DNS resolution / rebinding to private IPs (resolves A/AAAA records before connection)
 *
 * @module
 */
import { isIP } from "node:net";
import dns from "node:dns/promises";
export class FetchSecurityError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "FetchSecurityError";
        this.code = code;
    }
}
/**
 * Check if an IPv4 address falls within private, loopback, or link-local ranges.
 */
export function isPrivateOrRestrictedIpv4(ip) {
    const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
        return true; // invalid parsed shape -> block
    }
    const [a, b] = parts;
    // 0.0.0.0/8 (Current network)
    if (a === 0)
        return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127)
        return true;
    // 10.0.0.0/8 (RFC1918 Private)
    if (a === 10)
        return true;
    // 172.16.0.0/12 (RFC1918 Private: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31)
        return true;
    // 192.168.0.0/16 (RFC1918 Private)
    if (a === 192 && b === 168)
        return true;
    // 169.254.0.0/16 (Link Local / Cloud Metadata e.g. 169.254.169.254)
    if (a === 169 && b === 254)
        return true;
    // 100.64.0.0/10 (Carrier-grade NAT: 100.64.0.0 - 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127)
        return true;
    // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1), 198.51.100.0/24 (TEST-NET-2), 203.0.113.0/24 (TEST-NET-3)
    if (a === 192 && b === 0)
        return true;
    if (a === 198 && b === 51 && parts[2] === 100)
        return true;
    if (a === 203 && b === 0 && parts[2] === 113)
        return true;
    // 224.0.0.0/4 (Multicast: 224-239) & 240.0.0.0/4 (Reserved: 240-255)
    if (a >= 224)
        return true;
    return false;
}
/**
 * Check if an IPv6 address falls within private, loopback, or link-local ranges.
 */
export function isPrivateOrRestrictedIpv6(ip) {
    const normalized = ip.toLowerCase();
    // Loopback (::1) or unspecified (::)
    if (normalized === "::1" || normalized === "::" || normalized === "0:0:0:0:0:0:0:1" || normalized === "0:0:0:0:0:0:0:0") {
        return true;
    }
    // IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1 or hex format like ::ffff:7f00:1)
    if (normalized.startsWith("::ffff:") || normalized.startsWith("0:0:0:0:0:ffff:")) {
        const afterFfff = normalized.split("ffff:").pop() ?? "";
        if (isIP(afterFfff) === 4) {
            return isPrivateOrRestrictedIpv4(afterFfff);
        }
        // Parse hex-encoded IPv4 (e.g. 7f00:1 -> 127.0.0.1)
        const hexParts = afterFfff.split(":");
        if (hexParts.length === 2) {
            const high = Number.parseInt(hexParts[0], 16);
            const low = Number.parseInt(hexParts[1], 16);
            if (!Number.isNaN(high) && !Number.isNaN(low)) {
                const ipStr = `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
                return isPrivateOrRestrictedIpv4(ipStr);
            }
        }
        return true; // Malformed or ambiguous IPv4-mapped address -> block safely
    }
    // Unique local address fc00::/7 (fc00... to fdff...)
    if (/^f[cd][0-9a-f]{2}:/i.test(normalized) || normalized.startsWith("fc") || normalized.startsWith("fd")) {
        return true;
    }
    // Link-local unicast fe80::/10 (fe80... to febf...)
    if (/^fe[89ab][0-9a-f]:/i.test(normalized) || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
        return true;
    }
    return false;
}
/**
 * Check if a raw IP address (v4 or v6) is private or restricted.
 */
export function isPrivateOrRestrictedIp(ip) {
    const v = isIP(ip);
    if (v === 4)
        return isPrivateOrRestrictedIpv4(ip);
    if (v === 6)
        return isPrivateOrRestrictedIpv6(ip);
    return true; // Unknown or invalid IP -> block
}
/**
 * Validates a target URL structure before fetching to ensure it is a safe public HTTP/HTTPS URL.
 * Throws FetchSecurityError if invalid or blocked.
 */
export function validateFetchUrl(rawUrl) {
    if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
        throw new FetchSecurityError("WEB_INVALID_URL", "URL must be a non-empty string");
    }
    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    }
    catch {
        throw new FetchSecurityError("WEB_INVALID_URL", `Invalid URL format: "${rawUrl}"`);
    }
    // Protocol check: only http and https allowed
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new FetchSecurityError("WEB_INVALID_URL", `Unsupported protocol "${parsed.protocol}". Only http: and https: are allowed.`);
    }
    // Userinfo check: reject user:pass@host credentials embedded in URLs
    if (parsed.username || parsed.password) {
        throw new FetchSecurityError("WEB_INVALID_URL", `Embedded userinfo (username/password) in URL is forbidden for security reasons.`);
    }
    // Extract hostname (strip brackets from IPv6 if present)
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
        hostname = hostname.slice(1, -1);
    }
    // Empty or invalid hostname
    if (!hostname) {
        throw new FetchSecurityError("WEB_INVALID_URL", `Missing hostname in URL: "${rawUrl}"`);
    }
    // Named loopback / local domains
    if (hostname === "localhost" ||
        hostname === "ip6-localhost" ||
        hostname === "ip6-loopback" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".lan") ||
        hostname.endsWith(".localdomain")) {
        throw new FetchSecurityError("WEB_FETCH_BLOCKED", `Access to local/internal host "${hostname}" is blocked for security reasons.`);
    }
    // Literal IP address validation
    const ipVersion = isIP(hostname);
    if (ipVersion === 4) {
        if (isPrivateOrRestrictedIpv4(hostname)) {
            throw new FetchSecurityError("WEB_FETCH_BLOCKED", `Access to private/loopback/metadata IP "${hostname}" is blocked for security reasons.`);
        }
    }
    else if (ipVersion === 6) {
        if (isPrivateOrRestrictedIpv6(hostname)) {
            throw new FetchSecurityError("WEB_FETCH_BLOCKED", `Access to private/loopback IPv6 "${hostname}" is blocked for security reasons.`);
        }
    }
    return parsed;
}
/**
 * Resolves the hostname via DNS and verifies that all resolved A and AAAA addresses
 * point to public IP spaces. Prevents DNS rebinding and private IP domain spoofing.
 */
export async function validateFetchDns(hostname, lookupFn = (h, opts) => dns.lookup(h, opts)) {
    let cleanHost = hostname.toLowerCase();
    if (cleanHost.startsWith("[") && cleanHost.endsWith("]")) {
        cleanHost = cleanHost.slice(1, -1);
    }
    // If already a literal IP, validateFetchUrl already inspected it
    if (isIP(cleanHost) !== 0) {
        if (isPrivateOrRestrictedIp(cleanHost)) {
            throw new FetchSecurityError("WEB_FETCH_BLOCKED", `Access to private/restricted IP "${cleanHost}" is blocked for security reasons.`);
        }
        return;
    }
    try {
        const records = await lookupFn(cleanHost, { all: true });
        if (!records || records.length === 0) {
            throw new FetchSecurityError("WEB_INVALID_URL", `DNS resolution failed for hostname "${cleanHost}": no addresses found`);
        }
        for (const record of records) {
            if (isPrivateOrRestrictedIp(record.address)) {
                throw new FetchSecurityError("WEB_FETCH_BLOCKED", `DNS resolution for hostname "${cleanHost}" resolved to private/restricted IP "${record.address}", which is blocked for security reasons.`);
            }
        }
    }
    catch (err) {
        if (err instanceof FetchSecurityError)
            throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new FetchSecurityError("WEB_INVALID_URL", `DNS lookup failed for hostname "${cleanHost}": ${msg}`);
    }
}
