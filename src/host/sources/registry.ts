/**
 * dsh-web-tools — Specialized Source Registry & Router.
 *
 * Coordinates platform sources (Xiaohongshu, X) and manages routing from
 * DSH web_search and web_fetch calls.
 *
 * Decision flow:
 * 1. web_search(query) -> extractSearchHints(query).
 * 2. If hints.platform is detected AND corresponding source is enabled:
 *    - If source is authenticated via Bridge, execute native platform search.
 *    - If source not authenticated or encounters error, execute degraded web fallback.
 * 3. If hints.platform is NOT detected, execute standard general multi-provider search.
 *
 * @module
 */

import type {
  SpecializedPlatformId,
  SpecializedSource,
  SourceStatus,
  SourceSearchRequest,
  SourceSearchOutcome,
  SourceFetchOutcome,
} from "./types.ts";
import { fallbackSearchToGeneralWeb, fallbackFetchToGeneralWeb } from "./web-fallback.ts";
import type { WebSearchProviderLike, WebFetchProviderLike } from "../registry.ts";
import { extractSearchHints, type SearchHints } from "../search-hints.ts";

export interface RoutedSearchOutcome {
  content?: string;
  sources: Array<{ url: string; title?: string; snippet?: string; publishedAt?: string }>;
  truncated: boolean;
  attempts?: Array<{ provider: string; outcome: string; latencyMs?: number; sourcesFound?: number; error?: string }>;
  backend?: string;
}

export interface RoutedFetchOutcome {
  url: string;
  statusCode: number;
  body: { kind: "html" | "text"; content: string };
  truncated: boolean;
}

export class SpecializedSourceRegistry {
  private sources = new Map<SpecializedPlatformId, SpecializedSource>();
  private enabledSources = new Set<SpecializedPlatformId>(["xiaohongshu", "x"]);
  private allowDegradedFallback = true;

  public register(source: SpecializedSource): void {
    this.sources.set(source.id, source);
  }

  public get(id: SpecializedPlatformId): SpecializedSource | undefined {
    return this.sources.get(id);
  }

  public setEnabled(id: SpecializedPlatformId, enabled: boolean): void {
    if (enabled) {
      this.enabledSources.add(id);
    } else {
      this.enabledSources.delete(id);
    }
  }

  public isEnabled(id: SpecializedPlatformId): boolean {
    return this.enabledSources.has(id);
  }

  public setAllowDegradedFallback(allow: boolean): void {
    this.allowDegradedFallback = allow;
  }

  /**
   * Probe all registered sources.
   */
  public async probeAll(): Promise<SourceStatus[]> {
    const statuses: SourceStatus[] = [];
    for (const [id, source] of this.sources.entries()) {
      try {
        const status = await source.probe();
        statuses.push({
          ...status,
          enabled: this.isEnabled(id),
        });
      } catch (err: unknown) {
        statuses.push({
          id,
          enabled: this.isEnabled(id),
          bridgeConnected: false,
          authenticated: false,
          lastError: err instanceof Error ? err.message : String(err),
          lastCheckedAt: Date.now(),
        });
      }
    }
    return statuses;
  }

  /**
   * Determine whether a URL belongs to a specialized platform.
   */
  public matchPlatformUrl(url: string): SpecializedPlatformId | undefined {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (host.includes("xiaohongshu.com") || host.includes("xhslink.com")) {
        return "xiaohongshu";
      }
      if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
        return "x";
      }
    } catch {
      // Invalid URL, no platform match
    }
    return undefined;
  }

  /**
   * Route a web_search request to a specialized source if applicable,
   * or fall back to the general web search provider.
   */
  public async routeSearch(
    request: { query: string; maxResults?: number },
    generalSearch: WebSearchProviderLike,
    signal?: AbortSignal,
  ): Promise<RoutedSearchOutcome> {
    const hints = extractSearchHints(request.query);
    const platform = hints.platform;

    if (platform && this.isEnabled(platform)) {
      const source = this.get(platform);
      const searchReq: SourceSearchRequest = {
        query: hints.cleanQuery || request.query,
        maxResults: request.maxResults,
        hints,
      };

      if (source) {
        try {
          const status = await source.probe();
          if (status.authenticated && status.bridgeConnected) {
            const nativeOutcome = await source.search(searchReq, signal);
            if (!nativeOutcome.error && nativeOutcome.sources.length > 0) {
              return {
                sources: nativeOutcome.sources,
                truncated: false,
                backend: `source:${platform}`,
                attempts: [{
                  provider: `source:${platform}`,
                  outcome: "ok",
                  latencyMs: nativeOutcome.latencyMs,
                  sourcesFound: nativeOutcome.sources.length,
                }],
              };
            }
          }
        } catch {
          // Source error; proceed to degraded fallback if permitted
        }
      }

      // If native search was unavailable or yielded error, check if fallback is allowed
      if (this.allowDegradedFallback) {
        const fallbackOutcome = await fallbackSearchToGeneralWeb(platform, searchReq, generalSearch, signal);
        return {
          sources: fallbackOutcome.sources,
          truncated: false,
          backend: `fallback:${platform}`,
          attempts: [{
            provider: `fallback:${platform}`,
            outcome: fallbackOutcome.error ? "server-error" : "ok",
            latencyMs: fallbackOutcome.latencyMs,
            sourcesFound: fallbackOutcome.sources.length,
            error: fallbackOutcome.error,
          }],
        };
      }
    }

    // Default: route directly to general web search provider
    const outcome = await generalSearch.search(request, signal);
    return {
      ...outcome,
    };
  }

  /**
   * Route a web_fetch request to a specialized source if applicable,
   * or fall back to the general web fetch provider.
   */
  public async routeFetch(
    url: string,
    generalFetch: WebFetchProviderLike,
    signal?: AbortSignal,
  ): Promise<RoutedFetchOutcome> {
    const platform = this.matchPlatformUrl(url);

    if (platform && this.isEnabled(platform)) {
      const source = this.get(platform);
      if (source) {
        try {
          const status = await source.probe();
          if (status.authenticated && status.bridgeConnected) {
            const nativeOutcome = await source.fetch(url, signal);
            if (!nativeOutcome.error && (nativeOutcome.text || nativeOutcome.title)) {
              return {
                url,
                statusCode: 200,
                body: { kind: "text", content: nativeOutcome.text ?? nativeOutcome.title ?? "" },
                truncated: false,
              };
            }
          }
        } catch {
          // Fall through to general fetch
        }
      }

      if (this.allowDegradedFallback) {
        const fallbackOutcome = await fallbackFetchToGeneralWeb(platform, url, generalFetch, signal);
        return {
          url,
          statusCode: 200,
          body: { kind: "text", content: fallbackOutcome.text ?? "" },
          truncated: false,
        };
      }
    }

    return generalFetch.fetch({ url }, signal);
  }
}

import { defaultXiaohongshuSource } from "./xiaohongshu.ts";
import { defaultXSource } from "./x.ts";

/** Global singleton registry */
export const defaultSourceRegistry = new SpecializedSourceRegistry();
defaultSourceRegistry.register(defaultXiaohongshuSource);
defaultSourceRegistry.register(defaultXSource);

