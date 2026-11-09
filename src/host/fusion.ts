/**
 * dsh-web-tools — Reciprocal Rank Fusion (RRF) & URL Canonicalization.
 *
 * Merges multi-engine search results into a single ranked list. RRF computes:
 *   RRF(d) = sum_{m in M} 1 / (k + rank_m(d))
 * with default constant k = 60.
 *
 * Items appearing across multiple providers or ranking high in individual
 * providers are promoted naturally, while duplicates are merged and tracking
 * parameters stripped.
 * @module
 */
import type { Source } from "./providers/types.ts";

/** Tracking query parameters stripped during URL canonicalization. */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "ref_src",
  "fbclid",
  "gclid",
  "spm",
  "from",
  "source",
  "feature",
  "ved",
  "ei",
]);

/**
 * Canonicalize a URL for deduplication across search engines:
 *  - Lowercase scheme and hostname
 *  - Remove default ports
 *  - Strip trailing slashes on root path
 *  - Strip tracking and telemetry query params
 *  - Strip hash fragments
 */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";

    // Strip default ports
    if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
      parsed.port = "";
    }

    // Strip tracking query parameters
    const toDelete: string[] = [];
    for (const [key] of parsed.searchParams.entries()) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.startsWith("utm_")) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      parsed.searchParams.delete(key);
    }

    // Normalize root path
    let out = parsed.toString();
    if (out.endsWith("/") && parsed.pathname === "/" && !parsed.search) {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    // If invalid URL, return cleaned raw string
    return rawUrl.trim().toLowerCase();
  }
}

export interface ProviderResultSet {
  provider: string;
  sources: Source[];
}

export interface FusedSource extends Source {
  /** Aggregated Reciprocal Rank Fusion score. */
  rrfScore: number;
  /** Providers that contributed this result. */
  matchedProviders: string[];
}

/**
 * Fuse results from multiple search providers using Reciprocal Rank Fusion (RRF).
 *
 * @param resultSets array of provider outcomes with their ranked sources.
 * @param k RRF smoothing constant (default: 60).
 * @param maxResults optional cap on returned results.
 * @returns fused, deduplicated list of Sources sorted by RRF score descending.
 */
export function reciprocalRankFusion(
  resultSets: ProviderResultSet[],
  k = 60,
  maxResults?: number,
): FusedSource[] {
  const mergedMap = new Map<
    string,
    {
      originalUrl: string;
      title?: string;
      snippet?: string;
      publishedAt?: string;
      rrfScore: number;
      matchedProviders: Set<string>;
    }
  >();

  for (const set of resultSets) {
    const { provider, sources } = set;
    for (let rank = 0; rank < sources.length; rank++) {
      const item = sources[rank];
      if (!item || !item.url) continue;

      const canon = canonicalizeUrl(item.url);
      const score = 1 / (k + rank + 1); // 1-based rank

      const existing = mergedMap.get(canon);
      if (existing) {
        existing.rrfScore += score;
        existing.matchedProviders.add(provider);
        // Prefer longer / more informative snippet
        if (item.snippet && (!existing.snippet || item.snippet.length > existing.snippet.length)) {
          existing.snippet = item.snippet;
        }
        // Prefer longer / cleaner title
        if (item.title && (!existing.title || item.title.length > existing.title.length)) {
          existing.title = item.title;
        }
        // Keep published date if missing
        if (!existing.publishedAt && item.publishedAt) {
          existing.publishedAt = item.publishedAt;
        }
      } else {
        mergedMap.set(canon, {
          originalUrl: item.url,
          title: item.title,
          snippet: item.snippet,
          publishedAt: item.publishedAt,
          rrfScore: score,
          matchedProviders: new Set([provider]),
        });
      }
    }
  }

  const fused: FusedSource[] = Array.from(mergedMap.values()).map((entry) => ({
    url: entry.originalUrl,
    title: entry.title,
    snippet: entry.snippet,
    publishedAt: entry.publishedAt,
    rrfScore: entry.rrfScore,
    matchedProviders: Array.from(entry.matchedProviders),
  }));

  // Sort descending by RRF score
  fused.sort((a, b) => b.rrfScore - a.rrfScore);

  if (typeof maxResults === "number" && maxResults > 0) {
    return fused.slice(0, maxResults);
  }

  return fused;
}
