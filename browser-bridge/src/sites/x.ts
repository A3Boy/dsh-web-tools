/**
 * dsh-web-tools — Twitter / X DOM Parser & Query Operator Mapper.
 *
 * Implements:
 * 1. Query operator mapping (from:, lang:, since:, until:, filter:media, -filter:replies).
 * 2. Search URL generation: Top (f=top), Latest (f=live), Photos (f=image), Videos (f=video).
 * 3. Semantic DOM Extraction using standard `article[data-testid="tweet"]`, `[data-testid="tweetText"]`,
 *    `[data-testid="User-Name"]`, `time`, and metrics selectors (`[data-testid="like"]`, `[data-testid="retweet"]`).
 *
 * @module
 */

export interface XHintsLike {
  topic?: string;
  freshness?: {
    after?: string;
    before?: string;
  };
  locale?: {
    language?: string;
    country?: string;
  };
}

export interface ParsedTweetItem {
  id: string;
  url: string;
  title: string;
  text?: string;
  author?: string;
  authorHandle?: string;
  publishedAt?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
}

export interface XSearchOptions {
  tab?: "top" | "live" | "image" | "video";
  fromUser?: string;
  language?: string;
  sinceDate?: string;
  untilDate?: string;
}

/**
 * Clean and parse metrics (e.g. "1.5K" -> 1500, "2M" -> 2000000, "123" -> 123).
 */
export function parseXMetricNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const str = raw.trim().replace(/,/g, "");
  if (str.endsWith("K") || str.endsWith("k")) {
    const num = parseFloat(str.slice(0, -1));
    return Number.isFinite(num) ? Math.round(num * 1000) : undefined;
  }
  if (str.endsWith("M") || str.endsWith("m")) {
    const num = parseFloat(str.slice(0, -1));
    return Number.isFinite(num) ? Math.round(num * 1000000) : undefined;
  }
  const num = parseInt(str, 10);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Build an optimized x.com search URL using native operators and SearchHints.
 */
export function buildXSearchUrl(query: string, options?: XSearchOptions, hints?: Readonly<XHintsLike>): string {
  const parts: string[] = [query.trim()];

  if (options?.fromUser) {
    parts.push(`from:${options.fromUser.replace(/^@/, "")}`);
  }
  if (options?.language || hints?.locale?.language) {
    const lang = options?.language || hints?.locale?.language;
    parts.push(`lang:${lang}`);
  }
  if (options?.sinceDate || hints?.freshness?.after) {
    const since = options?.sinceDate || hints?.freshness?.after;
    parts.push(`since:${since}`);
  }
  if (options?.untilDate || hints?.freshness?.before) {
    const until = options?.untilDate || hints?.freshness?.before;
    parts.push(`until:${until}`);
  }

  const finalQuery = parts.join(" ").trim();
  const tab = options?.tab ?? (hints?.topic === "news" ? "live" : "top");

  const modeParam = tab === "live" ? "&f=live" : tab === "image" ? "&f=image" : tab === "video" ? "&f=video" : "";
  return `https://x.com/search?q=${encodeURIComponent(finalQuery)}&src=typed_query${modeParam}`;
}

/**
 * Pure function: Parse Tweet items from an x.com search or timeline DOM.
 */
export function parseXTweetDom(doc: Document): ParsedTweetItem[] {
  const tweets: ParsedTweetItem[] = [];
  const seenUrls = new Set<string>();

  const articles = Array.from(doc.querySelectorAll('article[data-testid="tweet"]'));

  for (const art of articles) {
    // 1. Tweet status link
    const linkEl = art.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
    const href = linkEl?.getAttribute("href");
    if (!href) continue;

    const fullUrl = href.startsWith("http") ? href : `https://x.com${href.startsWith("/") ? "" : "/"}${href}`;
    if (seenUrls.has(fullUrl)) continue;
    seenUrls.add(fullUrl);

    // 2. Tweet Text
    const textEl = art.querySelector('[data-testid="tweetText"]');
    const text = textEl?.textContent?.trim() || "";

    // 3. User & Handle
    const userNameEl = art.querySelector('[data-testid="User-Name"]');
    const authorText = userNameEl?.textContent || "";
    const handleMatch = authorText.match(/@([a-zA-Z0-9_]+)/);
    const authorHandle = handleMatch ? `@${handleMatch[1]}` : undefined;
    const author = authorText.split("@")[0]?.trim() || authorHandle;

    // 4. Time
    const timeEl = art.querySelector("time");
    const publishedAt = timeEl?.getAttribute("datetime") || timeEl?.textContent?.trim() || undefined;

    // 5. Metrics
    const replyEl = art.querySelector('[data-testid="reply"]');
    const retweetEl = art.querySelector('[data-testid="retweet"]');
    const likeEl = art.querySelector('[data-testid="like"]');

    const replies = parseXMetricNumber(replyEl?.textContent);
    const retweets = parseXMetricNumber(retweetEl?.textContent);
    const likes = parseXMetricNumber(likeEl?.textContent);

    const match = href.match(/\/status\/(\d+)/);
    const id = match ? match[1] : fullUrl;

    const title = author ? `${author}${authorHandle ? ` (${authorHandle})` : ""}: ${text.slice(0, 80)}...` : text.slice(0, 80);

    tweets.push({
      id,
      url: fullUrl,
      title,
      text,
      author,
      authorHandle,
      publishedAt,
      likes,
      retweets,
      replies,
    });
  }

  return tweets;
}
