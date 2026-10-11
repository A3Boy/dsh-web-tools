/**
 * dsh-web-tools — fenced HTTP routes for the settings card.
 *
 * The browser card talks to this Host plugin through its own `/web-tools/api`
 * prefix (following the proven `dsh-better-sidebar` pattern), which:
 *  - applies the same browser-trust fence as the /api gateway
 *  - never exposes credential values (reads return configured/writable state)
 *  - is the config-authority bridge for namespaces the settings RPC whitelist
 *    does not serve
 *
 * @module
 */
import type { WebToolsContext, WebToolsHttpRequest } from "./context-types.ts";
import { type PoolEntry } from "./pool.ts";
import type { QuotaSnapshot } from "./quota.ts";
import type { SearchMode, SearchModeView, VersionCheckView } from "../shared/api-types.ts";
import { type CustomCredentialRefs, type CustomSourceTestView } from "../shared/custom-provider-types.ts";
import type { SpecializedSourceRegistry } from "./sources/registry.ts";
/** Opaque per-key id for the remove-key endpoint (sha1 of the key, 8 hex). */
export declare function keyIdOf(key: string): string;
/** Route prefix (client fetches `/web-tools/api/<method>`). */
export declare const API_PREFIX = "/web-tools/api";
/** Dependencies the routes need (injected from the plugin entry). */
export interface RouteDeps {
    readConfig: () => Record<string, unknown>;
    writeConfig: (patch: Record<string, unknown>) => Promise<void>;
    readCredential: (ref: string) => Promise<{
        configured: boolean;
        source?: string;
        writable: boolean;
        value?: string;
    }>;
    writeCredential: (ref: string, value: string) => Promise<void>;
    testProviderSearch: (provider: string, query: string) => Promise<Record<string, unknown>>;
    testFullSearch: (query: string) => Promise<Record<string, unknown>>;
    describeQuotas: (force?: boolean) => Promise<Record<string, QuotaSnapshot>>;
    nativeRuntime: import("./browser/types.ts").NativeBrowserRuntime;
    sourceRegistry: SpecializedSourceRegistry;
    /**
     * Live pool entries for one provider (real key health from the executor),
     * so the card's per-key state matches what search actually uses.
     */
    poolEntries?: (provider: string) => Promise<PoolEntry[]>;
    /** Proxy support status (configured + whether undici is loadable). */
    proxyStatus?: () => Promise<{
        configured: boolean;
        degraded: boolean;
    }>;
    /** Cached, failure-tolerant GitHub release check. */
    checkVersion?: () => Promise<VersionCheckView>;
    /** Search-Mode runtime access (see search-mode-runtime.ts). */
    searchMode?: {
        view(sessionId: string): SearchModeView;
        set(sessionId: string, mode: SearchMode): SearchModeView;
    };
    /** Credential refs owned by one source (built-in or custom). */
    sourceRefs?: (sourceId: string) => CustomCredentialRefs | undefined;
    /** Test a draft or a saved custom source WITHOUT touching live health state. */
    testSource?: (input: {
        draft?: unknown;
        sourceId?: string;
        query: string;
    }) => Promise<CustomSourceTestView>;
    /** Remove every credential ref owned by a deleted source. */
    revokeSourceCredentials?: (sourceId: string) => Promise<{
        removed: string[];
        failed: string[];
    }>;
    /** Drop runtime state (health cooldown, key pool) for one source. */
    forgetSource?: (sourceId: string) => void;
}
/**
 * The real connection peer address.
 *
 * Returns `undefined` when the runtime does not expose a socket (an in-process
 * test double). Callers must treat `undefined` as "cannot verify" and fall back
 * to the Host check rather than assuming loopback.
 */
export declare function peerAddressOf(req: WebToolsHttpRequest): string | undefined;
/**
 * Whether this request may touch the configuration plane.
 *
 * @returns `"peer"` when the TCP peer is loopback (strongest), `"host"` when no
 *          peer address is exposed and the Host header is loopback (weaker,
 *          kept so in-process harnesses and tests still work), or `false`.
 */
export declare function configPlaneTrust(req: WebToolsHttpRequest): "peer" | "host" | false;
/** A route failure carrying an explicit HTTP status + machine code. */
export declare class RouteError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status?: number);
}
/** Register the fenced `/web-tools/api` prefix. Returns the disposer. */
export declare function registerRoutes(ctx: WebToolsContext, deps: RouteDeps): () => void;
