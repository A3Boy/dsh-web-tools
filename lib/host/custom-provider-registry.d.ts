import { type CredentialSource, type TransportFn } from "./providers/custom-compatible.ts";
import type { ProviderAdapter } from "./providers/types.ts";
import type { CustomProviderConfig } from "../shared/custom-provider-types.ts";
import { type DestinationTrust, type OutboundAuthorization, type OutboundPolicy } from "./provider-transport.ts";
export { OUTBOUND_AUTHORIZATIONS } from "./provider-transport.ts";
/** A source entry inside one snapshot. */
export interface CatalogEntry {
    /** Routing/health/pool key: `"exa"` or `"custom_ab12cd34"`. */
    sourceId: string;
    /** True for the eight built-in adapters. */
    builtIn: boolean;
    adapter: ProviderAdapter;
    /** Credential refs belonging to this source. */
    refs: {
        key?: string;
        username?: string;
        password?: string;
    };
    /**
     * True when this source can run WITHOUT a credential (auth mode `none`, or
     * a keyless self-hosted built-in). The executor uses this to execute with an
     * empty key instead of skipping the source.
     */
    keyless: boolean;
    /** How trusted this source's destination is. */
    trust: DestinationTrust;
    /** Outbound policy applied to this source's endpoint. */
    policy: OutboundPolicy;
    /** Resolved search endpoint (for diagnostics/UI). */
    endpoint?: {
        defaultBaseUrl: string;
        effectiveBaseUrl: string;
        isOverridden: boolean;
    };
    /** Present only for custom sources. */
    config?: CustomProviderConfig;
}
/** One immutable view of every available search source. */
export interface ProviderSnapshot {
    get(sourceId: string): CatalogEntry | undefined;
    list(): CatalogEntry[];
    has(sourceId: string): boolean;
}
/** Inputs the catalog is built from. */
export interface CatalogInputs {
    providerBaseUrls: Record<string, string>;
    customProviders: readonly CustomProviderConfig[];
    credentials: CredentialSource;
    transport: TransportFn;
    authorizations?: OutboundAuthorization[];
}
/**
 * Build the outbound policy for one custom source.
 *
 * A source whose configured base URL sits on the SAME host as a known official
 * endpoint keeps proxy support (the credential is going where it always went).
 * A source pointing anywhere else — a self-hosted instance, a company gateway,
 * a third-party proxy — must not be reached through an ambient HTTP proxy:
 * the policy then requires an explicit authorization, so a misconfigured proxy
 * fails closed instead of quietly forwarding the credential to whoever
 * terminates the proxy.
 */
export declare function policyForCustomSource(config: CustomProviderConfig, authorizations: readonly OutboundAuthorization[]): {
    policy: OutboundPolicy;
    trust: DestinationTrust;
};
/**
 * Assemble one snapshot.
 *
 * Built-ins keep their existing adapter identity, so their behavior (native
 * protocol handling, SearchHints, error classification, quota) is untouched.
 * Only the search endpoint they dial changes, and only when the operator set
 * an override — {@link endpointViewOf} guarantees an unset override resolves
 * to the exact official URL.
 */
export declare function buildProviderSnapshot(inputs: CatalogInputs): ProviderSnapshot;
/**
 * Whether editing a built-in's base URL moves its credential to a different
 * service. The settings card uses this to require explicit confirmation, so an
 * existing API key is never silently sent to a third-party host.
 */
export declare function isForeignBuiltInOverride(providerName: string, baseUrl: string): boolean;
