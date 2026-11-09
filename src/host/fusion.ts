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

/**
 * Query parameters stripped during URL canonicalization.
 *
 * Deliberately NARROW: only parameters that are unambiguously click-tracking
 * or telemetry. A broader list (source, from, ref, feature, ei, ved) merges
 * genuinely different pages — e.g. `?source=api` vs `?source=human` — into one
 * result and silently loses a candidate.
 */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "yclid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "mkt_tok",
  "vero_id",
  "oly_anon_id",
  "oly_enc_id",
  "spm",
  "scm",
  "ref_src",
  "ref_url",
]);

/**
 * Canonicalize a URL into a stable deduplication key:
 *  - lowercase scheme and hostname, drop a leading `www.`
 *  - remove default ports and hash fragments
 *  - strip click-tracking / telemetry query params
 *  - collapse a trailing slash (root and directory paths)
 *  - sort query params so `?a=1&b=2` and `?b=2&a=1` collide
 *
 * Only the KEY is normalized; the first-seen original URL is what gets shown.
 */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    parsed.hostname = host.startsWith("www.") ? host.slice(4) : host;
    parsed.hash = "";

    // Strip default ports
    if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
      parsed.port = "";
    }

    // Strip tracking query parameters
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        parsed.searchParams.delete(key);
      }
    }

    // Collapse a trailing slash, except on the bare root which loses it too.
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }

    // Stable query order (V8's sort is stable, so repeated keys keep their order).
    if ([...parsed.searchParams.keys()].length > 1) {
      const entries = [...parsed.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      parsed.search = "";
      for (const [k, v] of entries) parsed.searchParams.append(k, v);
    }

    // Root path normalization: `https://example.com/` → `https://example.com`.
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
 * Secondary dedupe key: same host + path + byte-identical title.
 *
 * Search APIs sometimes return the same document under cache-buster URLs
 * (`?cb=20260915tick`, `?_=1731555…`). Those query params are NOT safe to strip
 * globally (many sites use real query params), but an identical title on the
 * same host+path is strong evidence of the same document.
 *
 * Protocol and `www.` are ignored so an http/https pair of the same page also
 * collapses; the first-seen original URL is still what gets displayed.
 */
function pathTitleKey(rawUrl: string, title?: string): string | undefined {
  const normalizedTitle = title?.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalizedTitle) return undefined;
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}|${normalizedTitle}`;
  } catch {
    return undefined;
  }
}

/**
 * Fuse results from multiple search providers using Reciprocal Rank Fusion (RRF).
 *
 * Deduplication runs on two keys, in order:
 *  1. the canonical URL (tracking params, `www.`, trailing slash, param order);
 *  2. host+path with an identical title, which catches cache-buster variants
 *     that carry no meaningful URL-level difference.
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
  /** canonical URL → the entry key it was folded into. */
  const urlAlias = new Map<string, string>();
  /** host+path+title → the entry key it was folded into. */
  const titleAlias = new Map<string, string>();

  for (const set of resultSets) {
    const { provider, sources } = set;
    for (let rank = 0; rank < sources.length; rank++) {
      const item = sources[rank];
      if (!item || !item.url) continue;

      const canonicalUrl = canonicalizeUrl(item.url);
      const byUrl = urlAlias.get(canonicalUrl) ?? canonicalUrl;
      const byTitle = pathTitleKey(item.url, item.title);
      const target = (byTitle ? titleAlias.get(byTitle) : undefined) ?? byUrl;
      const score = 1 / (k + rank + 1); // 1-based rank

      const existing = mergedMap.get(target);
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
        mergedMap.set(target, {
          originalUrl: item.url,
          title: item.title,
          snippet: item.snippet,
          publishedAt: item.publishedAt,
          rrfScore: score,
          matchedProviders: new Set([provider]),
        });
      }

      // Remember both keys so a later provider's variant folds into this entry.
      if (byUrl !== target) urlAlias.set(canonicalUrl, target);
      if (byTitle && !titleAlias.has(byTitle)) titleAlias.set(byTitle, target);
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
