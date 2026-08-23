import type { SpecializedSource, SpecializedPlatformId, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome } from "./types.ts";
import type { WebSearchProviderLike, WebFetchProviderLike } from "../registry.ts";
export declare class SpecializedSourceRegistry {
    private sources;
    private fallbackSearchProvider?;
    private fallbackFetchProvider?;
    private platformEnabled;
    registerSource(source: SpecializedSource): void;
    setPlatformEnabled(enabledMap: Record<string, boolean>): void;
    isPlatformEnabled(platform: SpecializedPlatformId): boolean;
    unregisterSource(id: SpecializedPlatformId): void;
    getSource(id: SpecializedPlatformId): SpecializedSource | undefined;
    setFallbackProviders(search?: WebSearchProviderLike, fetch?: WebFetchProviderLike): void;
    getPlatformStatuses(): Promise<SourceStatus[]>;
    routeSearch(query: string, req?: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    search(query: string, req?: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchOutcome>;
    routeFetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
    fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome>;
}
export declare const defaultSourceRegistry: SpecializedSourceRegistry;
