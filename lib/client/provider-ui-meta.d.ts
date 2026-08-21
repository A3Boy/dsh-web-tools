/**
 * dsh-web-tools — provider UI metadata: dashboard URLs and capability copy
 * keys, centralized so QuotaInline / ProviderModal / index.ts all read from
 * ONE source instead of scattering URLs across components.
 * @module
 */
/** Official dashboard / billing URL per provider (target=_blank links). */
export declare const PROVIDER_DASHBOARD: Record<string, {
    labelKey: string;
    url: string;
}>;
/** Lookup a provider's dashboard entry; undefined for providers without one. */
export declare function dashboardOf(providerName?: string): {
    labelKey: string;
    url: string;
} | undefined;
/** Capability copy key per provider (locale dict holds the actual string). */
export declare const PROVIDER_CAPABILITY_KEY: Record<string, string>;
/** External-link icon (local SVG; no Unicode ↗ which renders inconsistently). */
export declare function ExternalLinkIcon(props: {
    size?: number;
}): import("react").JSX.Element;
