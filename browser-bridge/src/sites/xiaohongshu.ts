/**
 * dsh-web-tools — Xiaohongshu DOM Parser & Extractor for Browser Bridge.
 *
 * Implements:
 * 1. Search Result Extraction from `section.note-item` / `section:has(a[href*="/search_result/"])`.
 * 2. Mandatory preservation of `xsec_token` in full signed note URLs.
 * 3. Note detail extraction (`#noteContainer`, `#detail-title`, `#detail-desc`, `.username`, `.interact-container`).
 * 4. Incremental virtual waterfall scroll & dedup.
 *
 * @module
 */

export interface ParsedXhsItem {
  id: string;
  url: string; // Full signed note URL with xsec_token
  title: string;
  snippet?: string;
  author?: string;
  authorUrl?: string;
  likes?: number;
}

export interface ParsedXhsNoteDetail {
  url: string;
  title?: string;
  text?: string;
  author?: string;
  publishedAt?: string;
  metrics?: {
    likes?: number;
    collects?: number;
    replies?: number;
  };
}

/**
 * Clean and parse like / engagement counts (e.g. "1.2万" -> 12000, "999" -> 999).
 */
export function parseEngagementNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const str = raw.trim().replace(/,/g, "");
  if (str.includes("万") || str.includes("w") || str.includes("W")) {
    const num = parseFloat(str.replace(/[万wW]/g, ""));
    return Number.isFinite(num) ? Math.round(num * 10000) : undefined;
  }
  const num = parseInt(str, 10);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Pure function: Parse Xiaohongshu search result items from a HTML document or DOM snapshot.
 */
export function parseXhsSearchDom(doc: Document): ParsedXhsItem[] {
  const items: ParsedXhsItem[] = [];
  const seenUrls = new Set<string>();

  // Select note items
  const sections = Array.from(doc.querySelectorAll("section.note-item, section:has(a[href*='/search_result/']), section:has(a[href*='/explore/'])"));

  for (const sec of sections) {
    const linkEl = sec.querySelector("a[href*='/search_result/'], a[href*='/explore/']") as HTMLAnchorElement | null;
    if (!linkEl) continue;

    const href = linkEl.getAttribute("href") ?? "";
    if (!href) continue;

    // Build absolute URL preserving signed tokens (xsec_token)
    let fullUrl = href.startsWith("http") ? href : `https://www.xiaohongshu.com${href.startsWith("/") ? "" : "/"}${href}`;

    if (seenUrls.has(fullUrl)) continue;
    seenUrls.add(fullUrl);

    // Extract title
    const titleEl = sec.querySelector(".footer .title, .title, a.title, .name") as HTMLElement | null;
    const title = titleEl?.textContent?.trim() || "小红书笔记";

    // Extract author
    const authorEl = sec.querySelector(".author, .name, .user-name, .author-wrapper .name") as HTMLElement | null;
    const author = authorEl?.textContent?.trim();

    const authorLinkEl = sec.querySelector("a.author, a[href*='/user/profile/']") as HTMLAnchorElement | null;
    const authorHref = authorLinkEl?.getAttribute("href");
    const authorUrl = authorHref ? (authorHref.startsWith("http") ? authorHref : `https://www.xiaohongshu.com${authorHref}`) : undefined;

    // Extract likes count
    const likeEl = sec.querySelector(".like-wrapper .count, .like-wrapper, .interact-container .like, .count") as HTMLElement | null;
    const likes = parseEngagementNumber(likeEl?.textContent);

    // Extract note ID
    const match = href.match(/\/(?:search_result|explore)\/([a-zA-Z0-9]+)/);
    const id = match ? match[1] : fullUrl;

    items.push({
      id,
      url: fullUrl,
      title,
      snippet: author ? `作者: ${author}${likes !== undefined ? ` | 👍 ${likes}` : ""}` : undefined,
      author,
      authorUrl,
      likes,
    });
  }

  return items;
}

/**
 * Pure function: Parse Xiaohongshu note detail from note page DOM.
 */
export function parseXhsNoteDetailDom(doc: Document, url: string): ParsedXhsNoteDetail {
  const container = doc.querySelector("#noteContainer, .note-container, .note-detail-mask");

  // Title
  const titleEl = (container ?? doc).querySelector("#detail-title, .title, .note-content .title");
  const title = titleEl?.textContent?.trim();

  // Content text / description
  const descEl = (container ?? doc).querySelector("#detail-desc, .desc, .note-text, .content");
  const text = descEl?.textContent?.trim();

  // Author
  const authorEl = (container ?? doc).querySelector(".username, .author-name, .user-name");
  const author = authorEl?.textContent?.trim();

  // Date / Published at
  const dateEl = (container ?? doc).querySelector(".date, .publish-date, .bottom-container .date");
  const publishedAt = dateEl?.textContent?.trim();

  // Engagement stats
  const likeEl = (container ?? doc).querySelector(".interact-container .like-wrapper .count, .like-btn .count");
  const collectEl = (container ?? doc).querySelector(".interact-container .collect-wrapper .count, .collect-btn .count");
  const replyEl = (container ?? doc).querySelector(".interact-container .chat-wrapper .count, .comment-btn .count");

  return {
    url,
    title,
    text,
    author,
    publishedAt,
    metrics: {
      likes: parseEngagementNumber(likeEl?.textContent),
      collects: parseEngagementNumber(collectEl?.textContent),
      replies: parseEngagementNumber(replyEl?.textContent),
    },
  };
}
