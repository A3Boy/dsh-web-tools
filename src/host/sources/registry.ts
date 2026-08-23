import { validatePlatformUrl } from "../browser/paths.ts";
import { fallbackSearchToGeneralWeb, fallbackFetchToGeneralWeb } from "./web-fallback.ts";
import type {
  SpecializedSource,
  SpecializedPlatformId,
  SourceStatus,
  SourceSearchRequest,
  SourceSearchOutcome,
  SourceFetchOutcome,
} from "./types.ts";
import type { WebSearchProviderLike, WebFetchProviderLike } from "../registry.ts";

export class SpecializedSourceRegistry {
  private sources = new Map<SpecializedPlatformId, SpecializedSource>();
  private fallbackSearchProvider?: WebSearchProviderLike;
  private fallbackFetchProvider?: WebFetchProviderLike;

  registerSource(source: SpecializedSource): void {
    this.sources.set(source.id, source);
  }

  unregisterSource(id: SpecializedPlatformId): void {
    this.sources.delete(id);
  }

  getSource(id: SpecializedPlatformId): SpecializedSource | undefined {
    return this.sources.get(id);
  }

  setFallbackProviders(
    search?: WebSearchProviderLike,
    fetch?: WebFetchProviderLike,
  ): void {
    this.fallbackSearchProvider = search;
    this.fallbackFetchProvider = fetch;
  }

  async getPlatformStatuses(): Promise<SourceStatus[]> {
    const statuses: SourceStatus[] = [];
    for (const source of this.sources.values()) {
      try {
        const s = await source.status();
        statuses.push(s);
      } catch (err: any) {
        statuses.push({
          id: source.id,
          name: source.name,
          enabled: false,
          runtimeAvailable: false,
          runtimeState: "error",
          authenticated: false,
          lastError: err?.message || String(err),
          lastCheckedAt: Date.now(),
        });
      }
    }
    return statuses;
  }

  async routeSearch(
    query: string,
    req?: SourceSearchRequest,
    signal?: AbortSignal,
  ): Promise<SourceSearchOutcome> {
    return this.search(query, req, signal);
  }

  async search(
    query: string,
    req?: SourceSearchRequest,
    signal?: AbortSignal,
  ): Promise<SourceSearchOutcome> {
    const platform = req?.hints?.platform;
    if (!platform) {
      if (this.fallbackSearchProvider) {
        const res = await this.fallbackSearchProvider.search({ query, maxResults: req?.maxResults }, signal);
        const items = (res.sources || []).map((s) => ({
          id: s.url,
          title: s.title || s.url,
          url: s.url,
          snippet: s.snippet,
          platform: "general" as const,
        }));
        return { items, retrievalMode: "general-web" };
      }
      return { items: [] };
    }

    const source = this.sources.get(platform);
    if (!source) {
      return fallbackSearchToGeneralWeb(
        query,
        platform,
        this.fallbackSearchProvider,
        req?.maxResults,
        signal,
      );
    }

    const outcome = await source.search(query, req, signal);
    // If native search succeeded (even 0 results), keep native outcome!
    if (outcome.error === undefined) {
      return { ...outcome, retrievalMode: "native-browser" };
    }

    // Never fallback on explicit aborted signal
    if (signal?.aborted || outcome.error.code === "aborted") {
      return outcome;
    }

    // Fallback on failure
    return fallbackSearchToGeneralWeb(
      query,
      platform,
      this.fallbackSearchProvider,
      req?.maxResults,
      signal,
    );
  }

  async routeFetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome> {
    return this.fetch(url, signal);
  }

  async fetch(url: string, signal?: AbortSignal): Promise<SourceFetchOutcome> {
    let targetPlatform: SpecializedPlatformId | undefined;
    if (validatePlatformUrl(url, "xiaohongshu")) {
      targetPlatform = "xiaohongshu";
    } else if (validatePlatformUrl(url, "x")) {
      targetPlatform = "x";
    }

    if (!targetPlatform) {
      if (this.fallbackFetchProvider) {
        const res = await this.fallbackFetchProvider.fetch({ url }, signal);
        return {
          item: { id: url, title: "Web Page", url, text: res.body?.content || "", platform: "general" },
          retrievalMode: "general-web",
        };
      }
      return { error: { code: "runtime-unavailable", message: "No fetch provider available", retryable: false } };
    }

    const source = this.sources.get(targetPlatform);
    if (!source) {
      return fallbackFetchToGeneralWeb(url, this.fallbackFetchProvider, signal);
    }

    const outcome = await source.fetch(url, signal);
    if (outcome.error === undefined && outcome.item) {
      return { ...outcome, retrievalMode: "native-browser" };
    }

    if (signal?.aborted || outcome.error?.code === "aborted") {
      return outcome;
    }

    return fallbackFetchToGeneralWeb(url, this.fallbackFetchProvider, signal);
  }
}

export const defaultSourceRegistry = new SpecializedSourceRegistry();
