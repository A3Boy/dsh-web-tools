/**
 * dsh-web-tools — social post data models and parser.
 *
 * Pure data transformation functions that parse search result text into
 * structured post previews with covers, metrics, and author details.
 * Kept separate from UI components so it remains 100% testable in Node.
 * @module
 */

export interface PlatformInfo {
  label: string;
  color: string;
}

export const PLATFORMS: Record<string, PlatformInfo> = {
  "xiaohongshu.com": { label: "小红书", color: "#ff2442" },
  "xhslink.com": { label: "小红书", color: "#ff2442" },
  "x.com": { label: "X", color: "#0f1419" },
  "twitter.com": { label: "X", color: "#0f1419" },
};

export interface PostPreview {
  title: string;
  url: string;
  platform: PlatformInfo;
  author?: string;
  summary: string;
  publishedAt?: string;
  likes?: number;
  collects?: number;
  retweets?: number;
  replies?: number;
  cover?: string;
}

export function platformOf(url: string): PlatformInfo | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\.|^mobile\./, "");
    for (const key of Object.keys(PLATFORMS)) {
      if (host === key || host.endsWith("." + key)) return PLATFORMS[key];
    }
  } catch {
    /* not a URL */
  }
  return undefined;
}

export function compactNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const text = raw.trim().replace(/,/g, "");
  const wan = /^([\d.]+)\s*[万wW]$/.exec(text);
  if (wan) return Math.round(parseFloat(wan[1]) * 10000);
  const k = /^([\d.]+)\s*[kK]$/.exec(text);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function shortCount(value: number | undefined): string | undefined {
  if (typeof value !== "number") return undefined;
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
}

/** `昨天` / `3 天前` / `2026-09-18` from a YYYY-MM-DD[THH:mm:ss] stamp. */
export function relativeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = String(raw).trim();
  const date = new Date(text.length <= 10 ? `${text}T00:00:00` : text);
  if (Number.isNaN(date.getTime())) return text;
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return text.slice(0, 10);
}

export function parseSnippetMetrics(head: string) {
  const metric = (prefix: string, legacyEmoji?: string): number | undefined => {
    const pattern = legacyEmoji
      ? `(?:${prefix}|${legacyEmoji})\\s*([\\d.,]+\\s*[kKwW万]?)`
      : `${prefix}\\s*([\\d.,]+\\s*[kKwW万]?)`;
    const match = new RegExp(pattern).exec(head);
    return match ? compactNumber(match[1]) : undefined;
  };

  const author = ((/\[([^\]]+)\]/.exec(head) ?? [])[1] ?? "").replace(/^@+/, "") || undefined;
  const likes = metric("likes", "👍");
  const collects = metric("collects", "⭐");
  const retweets = metric("retweets", "🔁");
  const replies = metric("replies", "💬");

  return { author, likes, collects, retweets, replies };
}

/**
 * Parse search outcome into structured post previews.
 */
export function parseSearchResult(text: string, structuredSources?: any[]): { posts: PostPreview[]; raw: string } {
  const body = String(text ?? "");
  const covers: string[] = [];
  const coverBlock = /Covers[^\n]*:\s*\n([\s\S]*?)(?:\n\s*\n|$)/i.exec(body);
  if (coverBlock) {
    for (const line of coverBlock[1].split("\n")) {
      const found = /^\s*(\d+)\.\s+(\S+)\s*$/.exec(line);
      if (found) covers[Number(found[1]) - 1] = found[2];
    }
  }

  const posts: PostPreview[] = [];

  // 1. If structuredSources is supplied via block.meta.sources:
  if (Array.isArray(structuredSources) && structuredSources.length > 0) {
    for (let i = 0; i < structuredSources.length; i++) {
      const src = structuredSources[i];
      if (!src || typeof src.url !== "string") continue;
      const platform = platformOf(src.url);
      if (!platform) continue;

      let meta = (src.snippet || "").trim();
      let publishedAt: string | undefined = src.publishedAt;
      const dateMatch = /\((\d{4}-\d{2}-\d{2}[^)]*)\)\s*$/.exec(meta);
      if (dateMatch) {
        if (!publishedAt) publishedAt = dateMatch[1];
        meta = meta.slice(0, dateMatch.index).trim();
      }

      const chunks = meta.split(" · ");
      const head = chunks[0] ?? "";
      const { author, likes, collects, retweets, replies } = parseSnippetMetrics(head);
      const summary = chunks.slice(1).join(" · ").trim();

      posts.push({
        title: src.title || summary.slice(0, 40) || "无标题帖子",
        url: src.url,
        platform,
        author,
        summary: summary && summary !== src.title ? summary : "",
        publishedAt,
        likes,
        collects,
        retweets,
        replies,
        cover: src.coverImage || covers[i] || covers[posts.length],
      });
    }
    if (posts.length > 0) {
      return { posts, raw: body };
    }
  }

  // 2. Text-based markdown fallback from Sources block:
  const sourcesAt = body.indexOf("Sources:");
  if (sourcesAt >= 0) {
    for (const line of body.slice(sourcesAt + "Sources:".length).split("\n")) {
      const found = /^\s*-\s*\[(.+?)\]\((https?:\/\/[^\s)]+)\)\s*(?:—\s*(.*))?$/.exec(line);
      if (!found) continue;
      const title = found[1].trim();
      const url = found[2];
      const platform = platformOf(url);
      if (!platform) continue;

      let meta = (found[3] ?? "").trim();
      let publishedAt: string | undefined;
      const dateMatch = /\((\d{4}-\d{2}-\d{2}[^)]*)\)\s*$/.exec(meta);
      if (dateMatch) {
        publishedAt = dateMatch[1];
        meta = meta.slice(0, dateMatch.index).trim();
      }

      const chunks = meta.split(" · ");
      const head = chunks[0] ?? "";
      const { author, likes, collects, retweets, replies } = parseSnippetMetrics(head);
      const summary = chunks.slice(1).join(" · ").trim();

      posts.push({
        title: title || summary.slice(0, 40) || "无标题帖子",
        url,
        platform,
        author,
        summary: summary && summary !== title ? summary : "",
        publishedAt,
        likes,
        collects,
        retweets,
        replies,
        cover: covers[posts.length],
      });
    }
  }

  return { posts, raw: body };
}
