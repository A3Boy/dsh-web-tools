/**
 * dsh-web-tools — shared wire types between Host routes and the Client card.
 *
 * Single source of truth for the /web-tools/api contract, so Host return
 * shapes and Client consumption cannot drift apart.
 * @module
 */
import type { ProviderOptionView } from "./provider-options.ts";
import type { OutboundAuthorization } from "./custom-provider-types.ts";
/**
 * Search routing policy — how the host picks which provider to try first.
 *
 * Kept as a runtime array so the config schema, the HTTP validator and the
 * settings card all validate against ONE list: adding a policy cannot leave a
 * valid value rejected by whichever layer was forgotten (the exact defect that
 * made adaptive/fastest/cheapest unreachable from the UI and the API).
 */
export declare const SEARCH_ROUTING_POLICIES: readonly ["ordered", "round-robin", "random", "adaptive", "fastest", "cheapest"];
export type SearchRoutingPolicy = (typeof SEARCH_ROUTING_POLICIES)[number];
/** Whether a wire value is a known routing policy. */
export declare function isSearchRoutingPolicy(value: unknown): value is SearchRoutingPolicy;
/**
 * Retrieval orchestration strategy for one search request.
 *
 *  - single: try providers in the resolved order, one at a time (default).
 *  - hedged: start the first provider; if it is still running after
 *    `hedgeDelayMs`, start the second one in parallel. First success wins and
 *    the loser is CANCELLED so it stops consuming quota.
 *  - fused:  start two providers in parallel and merge both ranked lists with
 *    Reciprocal Rank Fusion. Wider recall at roughly double the cost.
 */
export declare const RETRIEVAL_STRATEGIES: readonly ["single", "hedged", "fused"];
export type RetrievalStrategy = (typeof RETRIEVAL_STRATEGIES)[number];
/** Whether a wire value is a known retrieval strategy. */
export declare function isRetrievalStrategy(value: unknown): value is RetrievalStrategy;
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
    /** Official base URL, for the "restore default" affordance. */
    defaultBaseUrl?: string;
    /**
     * Which host the credential will actually be sent to. True when the operator
     * pointed this provider at a host that is NOT the official endpoint, which
     * means an existing API key now leaves for a different service.
     */
    baseUrlForeign?: boolean;
    /** True when this row is an operator-defined custom source (Issue #9). */
    custom?: boolean;
    /** Wire protocol, custom sources only. */
    protocol?: string;
    /** Optimistic-concurrency revision, custom sources only. */
    revision?: number;
    /** Auth mode, custom sources only (`none` needs no credential). */
    authMode?: string;
    /** Full configuration for custom sources, preserving non-default mapping fields in the editor. */
    customConfig?: {
        endpoint: import("./custom-provider-types.ts").CustomEndpointConfig;
        auth?: import("./custom-provider-types.ts").CustomAuthConfig;
        request?: import("./custom-provider-types.ts").CustomRequestConfig;
        response?: import("./custom-provider-types.ts").CustomResponseConfig;
    };
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
    /** Provider-native execution settings (effective values + user overrides). */
    options?: ProviderOptionView;
}
/** Full config snapshot for the card. */
export interface ConfigView {
    enabled: boolean;
    defaultProvider: string;
    providerAttemptTimeoutMs: number;
    fallbackOrder: string[];
    providers: ProviderView[];
    platformEnabled?: Record<string, boolean>;
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
    /** Search routing policy (ordered/round-robin/random/adaptive/fastest/cheapest). */
    searchRoutingPolicy?: SearchRoutingPolicy;
    /** Cross-provider retrieval strategy (single/hedged/fused). */
    retrievalStrategy?: RetrievalStrategy;
    /** Operator-granted outbound destinations for internal gateways / private IPs. */
    outboundAuthorizations?: OutboundAuthorization[];
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
    /** True when the answer merged two providers with RRF. */
    fused?: boolean;
    /** Set when a platform query was served by a general web fallback. */
    degraded?: TextSearchDegradation;
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
/** Why a platform search was served by web results instead of native data. */
export interface TextSearchDegradation {
    code: string;
    message: string;
    platform?: string;
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
 * "Web Search mode" per-session policy:
 *  - `auto`     — the agent decides whether to research.
 *  - `required` — at least one completed web_search/web_fetch before the turn
 *                 may end (success OR failure counts as an attempt).
 *  - `off`      — web tools are withheld from the agent and any call is denied
 *                 at the tool gate, so "close web search" actually closes it
 *                 instead of merely dropping the requirement.
 * Host-owned state, so it survives browser refresh / relaunch.
 */
export type SearchMode = "auto" | "required" | "off";
/**
 * The click/keyboard cycle shared by the button and the `/search` command:
 * auto → required → off → auto. Keeping it in one place means the UI cannot
 * disagree with the slash command about what the next state is.
 */
export declare function nextSearchMode(mode: SearchMode): SearchMode;
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
/** Non-blocking release check surfaced by the settings page. */
export interface VersionCheckView {
    currentVersion: string;
    latestVersion?: string;
    updateAvailable: boolean;
    releaseUrl?: string;
    releaseName?: string;
    publishedAt?: string;
}
