import type { QuotaProvider, QuotaSnapshot } from "../quota.ts";
import type { ProviderAdapter } from "./types.ts";
import { providerError } from "./types.ts";
/** Adapter + optional quota reporter. */
export interface ProviderWithQuota extends ProviderAdapter {
    quota?: QuotaProvider["quota"];
}
/** All built-in adapters, keyed by name. */
export declare const PROVIDERS: Record<string, ProviderWithQuota>;
/** Ordered adapter list for UI/fallback iteration. */
export declare const PROVIDER_LIST: ProviderWithQuota[];
/** Look up an adapter; throws a classified config error when unknown. */
export declare function getProvider(name: string): ProviderWithQuota;
/**
 * Fetch a provider's quota snapshot with sensible defaults for providers
 * without a quota API (never throws for unsupported providers).
 */
export declare function quotaOf(providerName: string, apiKey: string, baseUrl: string | undefined, localCount?: number, signal?: AbortSignal): Promise<QuotaSnapshot>;
/** Credential ref for one provider ("WEB_TOOLS_TAVILY"). */
export declare function credRefOf(providerName: string): string;
export { providerError };
export type { ProviderError, ProviderAdapter, SearchOutcome, Source } from "./types.ts";
