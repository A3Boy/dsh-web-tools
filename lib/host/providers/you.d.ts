import { type ProviderAdapter } from "./types.ts";
import type { QuotaSnapshot } from "../quota.ts";
import type { YouProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";
/**
 * Build POST request body for You.com search.
 * Supports:
 *  - extraction: { extraction_mode: "highlights" }
 *  - boost_domains: soft ranking boost for prefer/preferOfficial domains without excluding other results
 *  - include_domains / exclude_domains (Note: boost_domains & include_domains cannot be combined)
 *  - freshness: "day" | "week" | "month" | "year"
 *  - country & language
 */
export declare function buildYouSearchBody(query: string, maxResults: number | undefined, options?: Readonly<YouProviderOptions>, hints?: Readonly<SearchHints>): Record<string, unknown>;
export declare const YOU_META: {
    name: string;
    label: string;
    description: string;
    credSuffix: string;
    fetchCapable: boolean;
    needsBaseUrl: boolean;
};
export declare const YouProvider: ProviderAdapter;
/** Snapshot provider for You.com. */
export declare function youQuota(apiKey: string, _signal?: AbortSignal): Promise<QuotaSnapshot>;
export declare function pollYouQuota(apiKey: string): Promise<QuotaSnapshot>;
