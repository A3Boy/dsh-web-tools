import type { XhsRawSearchFeed, XhsStructuredSearchExtraction } from "../xiaohongshu/types.ts";

export interface XhsNoteExtraction {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  authorName?: string;
  authorUrl?: string;
  likes?: number;
  comments?: number;
  collects?: number;
  coverImage?: string;
}

export function extractXhsSearchState(): XhsStructuredSearchExtraction {
  const state = (window as any).__INITIAL_STATE__;
  const feedsRef = state?.search?.feeds;

  if (!feedsRef) {
    return { available: false, feeds: [] };
  }

  // Resolve Vue reactive refs: feeds.value / feeds._value
  const resolved =
    feedsRef.value !== undefined
      ? feedsRef.value
      : feedsRef._value !== undefined
        ? feedsRef._value
        : feedsRef;

  // If resolved is a plain object (not array), it means the async search
  // results haven't loaded yet — treat as unavailable for this round.
  if (!Array.isArray(resolved) && typeof resolved === "object" && resolved !== null) {
    return { available: false, feeds: [] };
  }

  if (!Array.isArray(resolved)) {
    return { available: false, feeds: [] };
  }

  return { available: true, feeds: resolved };
}

export function extractVisibleXhsSearch(): XhsNoteExtraction[] {
  function parseCount(text: string): number | undefined {
    if (!text) return undefined;
    const clean = text.trim().replace(/,/g, "");
    if (/^\d+$/.test(clean)) return parseInt(clean, 10);
    const wanMatch = clean.match(/^([\d.]+)\s*[万wW]$/);
    if (wanMatch) return Math.round(parseFloat(wanMatch[1]) * 10000);
    const kMatch = clean.match(/^([\d.]+)\s*[kK]$/);
    if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
    return undefined;
  }

  const results: XhsNoteExtraction[] = [];
  const noteElements = Array.from(document.querySelectorAll("section.note-item"));

  for (const el of noteElements) {
    const linkEl = el.querySelector("a.cover") || el.querySelector("a[href*='/search_result/']") || el.querySelector("a[href*='/explore/']");
    if (!linkEl) continue;

    const href = linkEl.getAttribute("href") || "";
    if (!href) continue;

    const fullUrl = href.startsWith("http") ? href : `https://www.xiaohongshu.com${href}`;

    const idMatch = href.match(/\/(?:search_result|explore)\/([a-zA-Z0-9]+)/);
    const id = idMatch ? idMatch[1] : href;

    const titleEl = el.querySelector(".title span") || el.querySelector(".footer .title") || el.querySelector(".title");
    const title = titleEl ? (titleEl.textContent || "").trim() : "";

    const authorEl = el.querySelector(".author-wrapper .name") || el.querySelector(".author .name") || el.querySelector(".name");
    const authorName = authorEl ? (authorEl.textContent || "").trim() : undefined;

    const authorLinkEl = el.querySelector(".author-wrapper a.author") || el.querySelector(".author a");
    const authorHref = authorLinkEl ? authorLinkEl.getAttribute("href") : undefined;
    const authorUrl = authorHref ? (authorHref.startsWith("http") ? authorHref : `https://www.xiaohongshu.com${authorHref}`) : undefined;

    const likeEl = el.querySelector(".like-wrapper .count") || el.querySelector(".count");
    const likes = likeEl ? parseCount(likeEl.textContent || "") : undefined;

    const imgEl = el.querySelector("img.cover") || el.querySelector("img");
    const coverImage = imgEl ? (imgEl.getAttribute("src") || imgEl.getAttribute("data-src") || undefined) : undefined;

    if (title || id) {
      results.push({
        id,
        title: title || "无标题笔记",
        url: fullUrl,
        snippet: title,
        authorName,
        authorUrl,
        likes,
        coverImage,
      });
    }
  }

  return results;
}

export function extractXhsDetailState(noteId: string): {
  available: boolean;
  title?: string;
  text?: string;
  authorName?: string;
  authorUrl?: string;
  publishedAt?: string;
  likes?: number;
  collects?: number;
  comments?: number;
  images?: string[];
} {
  const state = (window as any).__INITIAL_STATE__;
  const map = state?.note?.noteDetailMap;

  if (!map || typeof map !== "object") {
    return { available: false };
  }

  let entry = map[noteId];

  if (!entry) {
    entry = Object.values(map).find(
      (v: any) => v?.note?.noteId === noteId,
    );
  }

  const note = entry?.note;
  if (!note) {
    return { available: false };
  }

  function parseCount(t: string | number | undefined): number | undefined {
    if (t === undefined || t === null) return undefined;
    if (typeof t === "number") return Number.isFinite(t) ? t : undefined;
    const raw = String(t).trim().replace(/,/g, "");
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    const wanMatch = raw.match(/^([\d.]+)\s*[万wW]\+?$/);
    if (wanMatch) return Math.round(parseFloat(wanMatch[1]) * 10000);
    const kMatch = raw.match(/^([\d.]+)\s*[kK]\+?$/);
    if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
    return undefined;
  }

  const interact = note.interactInfo;
  const user = note.user;

  let publishedAt: string | undefined;
  if (typeof note.time === "number") {
    const ts = note.time > 1e12 ? Math.floor(note.time / 1000) : note.time;
    if (ts > 0) {
      publishedAt = new Date(ts * 1000).toISOString();
    }
  }

  const images = Array.isArray(note.imageList)
    ? note.imageList
        .map((img: any) => img?.urlDefault || img?.urlPre || "")
        .filter(Boolean)
    : undefined;

  return {
    available: true,
    title: note.title || note.displayTitle,
    text: note.desc,
    authorName: user?.nickname || user?.nickName,
    authorUrl: user?.userId ? `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(user.userId)}` : undefined,
    publishedAt,
    likes: parseCount(interact?.likedCount),
    collects: parseCount(interact?.collectedCount),
    comments: parseCount(interact?.commentCount),
    images: images && images.length > 0 ? images : undefined,
  };
}

export function extractXhsNoteDetail(): {
  title?: string;
  text?: string;
  authorName?: string;
  authorUrl?: string;
  publishedAt?: string;
  likes?: number;
  collects?: number;
  comments?: number;
  images?: string[];
  isBlocked?: boolean;
} {
  const isSecurity = Boolean(
    document.querySelector(".security-verify") ||
    document.querySelector("#security-verify") ||
    document.title.includes("验证码") ||
    document.title.includes("安全验证")
  );

  if (isSecurity) {
    return { isBlocked: true };
  }

  const titleEl = document.querySelector("#detail-title") || document.querySelector(".title");
  const title = titleEl ? (titleEl.textContent || "").trim() : undefined;

  const descEl = document.querySelector("#detail-desc") || document.querySelector(".desc") || document.querySelector(".content");
  const text = descEl ? (descEl.textContent || "").trim() : undefined;

  const authorEl = document.querySelector(".author-container .name") || document.querySelector(".author .name");
  const authorName = authorEl ? (authorEl.textContent || "").trim() : undefined;

  const authorLinkEl = document.querySelector(".author-container a") || document.querySelector(".author a");
  const authorHref = authorLinkEl ? authorLinkEl.getAttribute("href") : undefined;
  const authorUrl = authorHref ? (authorHref.startsWith("http") ? authorHref : `https://www.xiaohongshu.com${authorHref}`) : undefined;

  const dateEl = document.querySelector(".date") || document.querySelector(".bottom-container .date");
  const publishedAt = dateEl ? (dateEl.textContent || "").trim() : undefined;

  function parseCount(t: string): number | undefined {
    if (!t) return undefined;
    const clean = t.trim().replace(/,/g, "");
    if (/^\d+$/.test(clean)) return parseInt(clean, 10);
    const wanMatch = clean.match(/^([\d.]+)\s*[万wW]$/);
    if (wanMatch) return Math.round(parseFloat(wanMatch[1]) * 10000);
    const kMatch = clean.match(/^([\d.]+)\s*[kK]$/);
    if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
    return undefined;
  }

  const likeEl = document.querySelector(".interact-container .like-wrapper .count") || document.querySelector(".like-wrapper .count");
  const likes = likeEl ? parseCount(likeEl.textContent || "") : undefined;

  const collectEl = document.querySelector(".interact-container .collect-wrapper .count") || document.querySelector(".collect-wrapper .count");
  const collects = collectEl ? parseCount(collectEl.textContent || "") : undefined;

  const chatEl = document.querySelector(".interact-container .chat-wrapper .count") || document.querySelector(".chat-wrapper .count");
  const comments = chatEl ? parseCount(chatEl.textContent || "") : undefined;

  const imgElements = Array.from(document.querySelectorAll(".note-slider img, .media-container img, .carousel img"));
  const images = imgElements
    .map((img) => img.getAttribute("src") || img.getAttribute("data-src") || "")
    .filter(Boolean);

  return {
    title,
    text,
    authorName,
    authorUrl,
    publishedAt,
    likes,
    collects,
    comments,
    images: images.length > 0 ? images : undefined,
    isBlocked: false,
  };
}
