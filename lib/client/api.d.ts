/**
 * dsh-web-tools — browser card: typed fetch client over the plugin's fenced
 * `/web-tools/api` routes.
 *
 * The browser never talks to provider APIs directly and never receives
 * credential values — only configured/writable state and quota snapshots
 * (which contain no secrets).
 * @module
 */
export declare const API_PREFIX = "/web-tools/api";
/** One wire failure. */
export declare class WebToolsApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Call one API method; throws WebToolsApiError on failure. */
export declare function call<T>(method: string, payload?: unknown): Promise<T>;
import type { ConfigView, CredentialsView, QuotaDescribeView, SearchMode, SearchModeView, TestProviderView, TestSearchView, SearchRoutingPolicy, VersionCheckView } from "../shared/api-types.ts";
export type { ConfigView, CredentialsView, ProviderView, QuotaDescribeView, QuotaView, SearchMode, SearchModeView, TestProviderView, TestSearchView, SearchRoutingPolicy, VersionCheckView } from "../shared/api-types.ts";
export declare const api: {
    configGet: () => Promise<ConfigView>;
    configSave: (payload: Record<string, unknown>) => Promise<{
        saved: true;
    }>;
    credentialsDescribe: () => Promise<CredentialsView>;
    credentialsSet: (provider: string, value: string) => Promise<{
        configured: boolean;
        poolSize: number;
    }>;
    credentialsAddKey: (provider: string, value: string) => Promise<{
        configured: boolean;
        poolSize: number;
    }>;
    credentialsRemoveKey: (provider: string, keyId: string) => Promise<{
        configured: boolean;
        poolSize: number;
    }>;
    testProvider: (provider: string, query?: string) => Promise<TestProviderView>;
    testSearch: (query: string) => Promise<TestSearchView>;
    quotaDescribe: (force?: boolean) => Promise<QuotaDescribeView>;
    versionCheck: () => Promise<VersionCheckView>;
    searchModeGet: (sessionId: string) => Promise<SearchModeView>;
    searchModeSet: (sessionId: string, mode: SearchMode) => Promise<SearchModeView>;
    providerOptionsSet: (provider: string, options: Record<string, unknown>) => Promise<{
        saved: true;
        options: any;
    }>;
    providerOptionsReset: (provider: string) => Promise<{
        reset: true;
        options: any;
    }>;
    providerOptionsBatch: (providers: Record<string, Record<string, unknown> | null>) => Promise<Record<string, any>>;
    routingSet: (policy: SearchRoutingPolicy, orderedProviders: string[]) => Promise<{
        saved: true;
        policy: SearchRoutingPolicy;
        defaultProvider: string;
        fallbackOrder: string[];
    }>;
};
