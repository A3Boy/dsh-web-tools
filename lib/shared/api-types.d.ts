/**
 * dsh-web-tools — shared wire types between Host routes and the Client card.
 *
 * Single source of truth for the /web-tools/api contract, so Host return
 * shapes and Client consumption cannot drift apart.
 * @module
 */
/** One provider as surfaced to the settings card. */
export interface ProviderView {
    name: string;
    label: string;
    description: string;
    enabled: boolean;
    /** Resolved base URL (explicit setting or adapter default). */
    baseUrl?: string;
    /** True only when the operator explicitly configured a base URL (adapter defaults don't count). */
    baseUrlConfigured?: boolean;
    credRef: string;
    keyConfigured: boolean;
    keyWritable: boolean;
    keyHint?: string;
    /** Number of keys in the credential pool (no per-key health — runtime state). */
    poolSize: number;
    /** Per-key masked hints + live health (no secrets; display only). */
    keys?: Array<{
        id: string;
        hint: string;
        healthy: boolean;
    }>;
}
/** Full config snapshot for the card. */
export interface ConfigView {
    enabled: boolean;
    defaultProvider: string;
    providerAttemptTimeoutMs: number;
    fallbackOrder: string[];
    providers: ProviderView[];
    /**
     * Proxy support state: whether a proxy is configured (env var or Windows
     * system proxy) and whether undici (the proxy engine) is loadable. When a
     * proxy is needed but undici is missing, outbound calls degrade to direct
     * fetch — the card should warn the operator.
     */
    proxy?: {
        configured: boolean;
        /** Proxy desired but undici unavailable → degraded to direct fetch. */
        degraded: boolean;
    };
    /**
     * Page UI language: "auto" follows the DSH UI language, "zh"/"en" force the
     * page to that language regardless of the DSH-wide preference.
     */
    uiLanguage?: "auto" | "zh" | "en";
}
/** One quota snapshot for the card (display only). */
export interface QuotaView {
    supported: boolean;
    authoritative: boolean;
    unit: string;
    remaining?: number;
    used?: number;
    limit?: number;
    resetAt?: string;
    breakdown?: Record<string, number>;
    source: string;
    fetchedAt?: number;
    note?: string;
}
/** Result of a Test Search run through the real executor. */
export interface TestSearchView {
    ok: boolean;
    backend?: string;
    latencyMs?: number;
    resultCount?: number;
    results?: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
    attempts?: Array<{
        provider: string;
        outcome: string;
        latencyMs?: number;
    }>;
    error?: {
        code: string;
        message: string;
    };
}
/** Result of a single-provider connection test. */
export interface TestProviderView {
    ok: boolean;
    latencyMs?: number;
    resultCount?: number;
    title?: string;
    error?: {
        code: string;
        message: string;
    };
}
/** A credential's configured state (values never cross the wire). */
export interface CredentialView {
    configured: boolean;
    source?: string;
    writable: boolean;
}
/** The full credentials/describe response. */
export interface CredentialsView {
    credentials: Record<string, CredentialView>;
}
/**
 * "Web Search mode" per-session policy: `auto` lets the agent decide whether
 * to call web_search; `required` demands at least one completed web_search
 * call (success OR failure) before that turn may end. Host-owned state, so it
 * survives browser refresh / relaunch.
 */
export type SearchMode = "auto" | "required";
/** The search-mode state surfaced to the client. */
export interface SearchModeView {
    mode: SearchMode;
    /** True when there is currently a usable search provider (button gray-out). */
    available: boolean;
}
/** The full quota/describe response. */
export interface QuotaDescribeView {
    quotas: Record<string, QuotaView>;
}
