import type { SpecializedPlatformId, SourceSearchOutcome, SourceFetchOutcome, SourceDegradation } from "./types.ts";
import type { WebSearchProviderLike, WebFetchProviderLike } from "../registry.ts";
export declare function buildFallbackQuery(query: string, platform: SpecializedPlatformId): string;
export declare function fallbackSearchToGeneralWeb(query: string, platform: SpecializedPlatformId, generalSearch?: WebSearchProviderLike, maxResults?: number, signal?: AbortSignal, reason?: SourceDegradation): Promise<SourceSearchOutcome>;
export declare function fallbackFetchToGeneralWeb(url: string, generalFetch?: WebFetchProviderLike, signal?: AbortSignal): Promise<SourceFetchOutcome>;
