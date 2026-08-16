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
import type { WebToolsContext } from "./context-types.ts";
import { type PoolEntry } from "./pool.ts";
import type { QuotaSnapshot } from "./quota.ts";
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
    /**
     * Live pool entries for one provider (real key health from the executor),
     * so the card's per-key state matches what search actually uses.
     */
    poolEntries?: (provider: string) => Promise<PoolEntry[]>;
}
/** Register the fenced `/web-tools/api` prefix. Returns the disposer. */
export declare function registerRoutes(ctx: WebToolsContext, deps: RouteDeps): () => void;
