/**
 * dsh-web-tools — the `web_search` result card: a social-post picker.
 *
 * The agent gets a plain text result; this card is the HUMAN face of the same
 * call. It parses the text this repository itself produces (`Covers` block +
 * `Sources` list) into posts and renders a uniform, image-led list, so the user
 * picks a post to read instead of scanning a wall of markdown.
 *
 * Clicking 「深入了解」 does not fetch anything here: it sends a normal user
 * message ("详细读一下这篇：<url>") so the next Agent turn performs the read,
 * which keeps the model in charge of analysis.
 * @module
 */
import * as React from "react";
import { IconLikeOutline14, IconRefreshOutline14, IconRightUpOutline14 } from "./icons.ts";

interface PlatformInfo {
  label: string;
  color: string;
}

const PLATFORMS: Record<string, PlatformInfo> = {
  "xiaohongshu.com": { label: "小红书", color: "#ff2442" },
  "x.com": { label: "X", color: "#0f1419" },
  "twitter.com": { label: "X", color: "#0f1419" },
};

interface PostPreview {
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

function platformOf(url: string): PlatformInfo | undefined {
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

function compactNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const text = raw.trim().replace(/,/g, "");
  const wan = /^([\d.]+)\s*[万wW]$/.exec(text);
  if (wan) return Math.round(parseFloat(wan[1]) * 10000);
  const k = /^([\d.]+)\s*[kK]$/.exec(text);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? n : undefined;
}

function shortCount(value: number | undefined): string | undefined {
  if (typeof value !== "number") return undefined;
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
}

/** `昨天` / `3 天前` / `2026-09-18` from a YYYY-MM-DD[THH:mm:ss] stamp. */
function relativeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = String(raw);
  const date = new Date(text.length <= 10 ? `${text}T00:00:00` : text);
  if (Number.isNaN(date.getTime())) return text;
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return text.slice(0, 10);
}

/**
 * Parse the model-facing `web_search` text into post previews.
 * @param text - the tool result text (Covers block + Sources list).
 */
export function parseSearchResult(text: string): { posts: PostPreview[]; raw: string } {
  const body = String(text ?? "");
  const covers: string[] = [];
  const coverBlock = /Covers[^\n]*:\s*\n([\s\S]*?)(?:\n\s*\n|$)/.exec(body);
  if (coverBlock) {
    for (const line of coverBlock[1].split("\n")) {
      const found = /^\s*(\d+)\.\s+(\S+)\s*$/.exec(line);
      if (found) covers[Number(found[1]) - 1] = found[2];
    }
  }

  const posts: PostPreview[] = [];
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
      const author = ((/\[([^\]]+)\]/.exec(head) ?? [])[1] ?? "").replace(/^@+/, "") || undefined;
      const metric = (icon: string): number | undefined => {
        const match = new RegExp(`${icon}\\s*([\\d.,]+\\s*[kKwW万]?)`).exec(head);
        return match ? compactNumber(match[1]) : undefined;
      };
      const summary = chunks.slice(1).join(" · ").trim();

      posts.push({
        title: title || summary.slice(0, 40) || "无标题帖子",
        url,
        platform,
        author,
        summary: summary && summary !== title ? summary : "",
        publishedAt,
        likes: metric("👍"),
        collects: metric("⭐"),
        retweets: metric("🔁"),
        replies: metric("💬"),
        cover: covers[posts.length],
      });
    }
  }
  return { posts, raw: body };
}

const CSS = `
.wt-picker {
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-1, transparent);
  padding: 18px 20px 12px;
  color: var(--dsw-alias-label-primary, inherit);
  box-sizing: border-box;
}
.wt-picker-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.wt-picker-title { font: var(--dsw-font-m-18, 600 16px/26px inherit); }
.wt-picker-count {
  flex: 0 0 auto; padding: 3px 10px; border-radius: 8px;
  background: var(--dsw-alias-bg-overlay, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-secondary, inherit);
  font: var(--dsw-font-xxs-12, 12px/18px inherit); white-space: nowrap;
}
.wt-picker-sub {
  margin-top: 4px; color: var(--dsw-alias-label-tertiary, inherit);
  font: var(--dsw-font-s-14, 14px/22px inherit);
}
.wt-picker-rows { margin-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06)); }
.wt-post {
  display: flex; gap: 16px; padding: 16px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
}
.wt-post-cover {
  flex: 0 0 auto; width: 168px; height: 120px; border-radius: 10px;
  object-fit: cover; background: var(--dsw-alias-bg-overlay, rgba(0, 0, 0, 0.05));
}
.wt-post-cover-empty {
  flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  width: 168px; height: 120px; border-radius: 10px;
  background: var(--dsw-alias-bg-overlay, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-tertiary, inherit);
}
.wt-post-cover-empty strong { font: 600 22px/1 inherit; color: var(--dsw-alias-label-secondary, inherit); }
.wt-post-cover-empty span { font: var(--dsw-font-xxs-12, 12px/18px inherit); }
.wt-post-main { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1 1 auto; }
.wt-post-meta {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  color: var(--dsw-alias-label-tertiary, inherit);
  font: var(--dsw-font-xs-13, 12px/19px inherit);
}
.wt-post-platform { font-weight: 500; }
.wt-post-dot { opacity: 0.45; }
.wt-post-title {
  font: var(--dsw-font-m-18, 600 16px/24px inherit);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.wt-post-summary {
  color: var(--dsw-alias-label-secondary, inherit);
  font: var(--dsw-font-s-14, 14px/22px inherit);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.wt-post-stats {
  display: flex; align-items: center; gap: 14px;
  color: var(--dsw-alias-label-tertiary, inherit);
  font: var(--dsw-font-xs-13, 12px/19px inherit);
}
.wt-post-stat { display: inline-flex; align-items: center; gap: 4px; }
.wt-post-actions { display: flex; gap: 10px; margin-top: 2px; }
.wt-pbtn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 36px; padding: 0 16px; border-radius: 8px; cursor: pointer;
  font: var(--dsw-font-s-strong-14, 500 14px/22px inherit);
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1419);
  border: 1px solid var(--dsw-alias-border-l3, #e3e3e6);
}
.wt-pbtn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04)); }
.wt-pbtn-primary {
  color: var(--dsw-alias-link, #4176e6);
  border-color: color-mix(in srgb, var(--dsw-alias-link, #4176e6) 40%, transparent);
}
.wt-pbtn:focus-visible { outline: 2px solid var(--dsw-alias-link, #4176e6); outline-offset: 2px; }
.wt-picker-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding-top: 12px; color: var(--dsw-alias-label-tertiary, inherit);
  font: var(--dsw-font-xxs-12, 12px/18px inherit);
}
.wt-picker-link {
  background: none; border: 0; padding: 0; cursor: pointer; margin-left: 8px;
  color: var(--dsw-alias-label-tertiary, inherit); font: inherit;
  text-decoration: underline; text-underline-offset: 2px;
}
.wt-picker-link:hover { color: var(--dsw-alias-label-secondary, inherit); }
.wt-picker-raw {
  margin-top: 10px; max-height: 220px; overflow: auto; padding: 10px; border-radius: 10px;
  background: var(--dsw-alias-markdown-code-block, rgba(0, 0, 0, 0.03));
  font: var(--dsw-font-markdown-code-block, 11px/19px monospace);
  white-space: pre-wrap; word-break: break-word;
  color: var(--dsw-alias-label-secondary, inherit);
}
@media (max-width: 640px) {
  .wt-post-cover, .wt-post-cover-empty { width: 112px; height: 84px; }
  .wt-post-title { font-size: 15px; }
}
`;

function textOfBlock(block: any): string {
  const content = block && Array.isArray(block.content) ? block.content : [];
  return content
    .filter((part: any) => part && part.kind === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("\n");
}

function Stat({ icon, value }: { icon: React.ReactNode; value?: number }) {
  const shown = shortCount(value);
  if (!shown) return null;
  return React.createElement("span", { className: "wt-post-stat" }, icon, shown);
}

/**
 * The `web_search` tool result card.
 * @param props - slot props: `phase`/`block` for the call, plus `inputActions`.
 */
export function SocialPostPicker(props: any) {
  const [showRaw, setShowRaw] = React.useState(false);
  const text = React.useMemo(
    () => (props.phase === "result" ? textOfBlock(props.block) : ""),
    [props.phase, props.block],
  );
  const { posts, raw } = React.useMemo(() => parseSearchResult(text), [text]);

  if (posts.length === 0) {
    if (!raw) return null;
    return React.createElement(
      "div",
      { className: "wt-picker" },
      React.createElement("style", { dangerouslySetInnerHTML: { __html: CSS } }),
      React.createElement("div", { className: "wt-picker-raw" }, raw),
    );
  }

  const counts = posts.reduce<Record<string, number>>((acc, post) => {
    acc[post.platform.label] = (acc[post.platform.label] ?? 0) + 1;
    return acc;
  }, {});
  const countChip = Object.keys(counts)
    .map((label) => `${counts[label]} ${label}`)
    .join(" · ");
  const shown = posts.slice(0, 3);

  const inspect = (url: string) => {
    const actions = props.inputActions;
    try {
      actions.setDraft(`详细读一下这篇：${url}`);
    } catch {
      /* a submission may be in flight */
    }
    setTimeout(() => {
      try {
        actions.submit();
      } catch {
        /* the user can press Enter */
      }
    }, 0);
  };

  return React.createElement(
    "div",
    { className: "wt-picker" },
    React.createElement("style", { dangerouslySetInnerHTML: { __html: CSS } }),
    React.createElement(
      "div",
      { className: "wt-picker-head" },
      React.createElement("div", { className: "wt-picker-title" }, `找到 ${posts.length} 条相关帖子`),
      React.createElement("div", { className: "wt-picker-count" }, countChip),
    ),
    React.createElement(
      "div",
      { className: "wt-picker-sub" },
      "先看看哪条感兴趣，我可以继续帮你查看正文和评论。",
    ),
    React.createElement(
      "div",
      { className: "wt-picker-rows" },
      ...shown.map((post, index) =>
        React.createElement(
          "article",
          { key: `${index}:${post.url}`, className: "wt-post" },
          post.cover
            ? React.createElement("img", {
                className: "wt-post-cover",
                src: post.cover,
                alt: "",
                loading: "lazy",
              })
            : React.createElement(
                "div",
                { className: "wt-post-cover-empty" },
                React.createElement("strong", null, post.platform.label === "X" ? "X" : "小红书"),
                React.createElement("span", null, "文字帖"),
              ),
          React.createElement(
            "div",
            { className: "wt-post-main" },
            React.createElement(
              "div",
              { className: "wt-post-meta" },
              React.createElement(
                "span",
                { className: "wt-post-platform", style: { color: post.platform.color } },
                post.platform.label,
              ),
              post.author
                ? React.createElement("span", { className: "wt-post-dot" }, "·")
                : null,
              post.author ? React.createElement("span", null, `@${post.author}`) : null,
              post.publishedAt
                ? React.createElement("span", { className: "wt-post-dot" }, "·")
                : null,
              post.publishedAt
                ? React.createElement("span", null, relativeDate(post.publishedAt))
                : null,
            ),
            React.createElement("div", { className: "wt-post-title" }, post.title),
            post.summary
              ? React.createElement("div", { className: "wt-post-summary" }, post.summary)
              : null,
            React.createElement(
              "div",
              { className: "wt-post-stats" },
              React.createElement(Stat, {
                icon: React.createElement(IconLikeOutline14, null),
                value: post.likes,
              }),
              typeof post.collects === "number"
                ? React.createElement("span", { className: "wt-post-stat" }, "收藏 ", shortCount(post.collects))
                : null,
              typeof post.replies === "number"
                ? React.createElement("span", { className: "wt-post-stat" }, "评论 ", shortCount(post.replies))
                : null,
              React.createElement(Stat, {
                icon: React.createElement(IconRefreshOutline14, null),
                value: post.retweets,
              }),
            ),
            React.createElement(
              "div",
              { className: "wt-post-actions" },
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "wt-pbtn wt-pbtn-primary",
                  onClick: () => inspect(post.url),
                },
                "深入了解",
                React.createElement(IconRightUpOutline14, null),
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "wt-pbtn",
                  onClick: () => window.open(post.url, "_blank", "noopener,noreferrer"),
                },
                "查看原帖",
              ),
            ),
          ),
        ),
      ),
    ),
    React.createElement(
      "div",
      { className: "wt-picker-foot" },
      React.createElement(
        "span",
        null,
        `展示精选的 ${shown.length} 条 · 来自小红书 / X 的原生搜索`,
      ),
      React.createElement(
        "span",
        null,
        posts.length > shown.length ? `还有 ${posts.length - shown.length} 条在下方来源列表` : "更多来源见下方",
        React.createElement(
          "button",
          {
            type: "button",
            className: "wt-picker-link",
            onClick: () => setShowRaw((value) => !value),
          },
          showRaw ? "收起原始结果" : "查看原始结果",
        ),
      ),
    ),
    showRaw
      ? React.createElement("div", { className: "wt-picker-raw" }, raw)
      : null,
  );
}
