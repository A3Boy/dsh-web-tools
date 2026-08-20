import { type ProviderAdapter } from "./types.ts";
import type { QuotaSnapshot } from "../quota-types.ts";
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
