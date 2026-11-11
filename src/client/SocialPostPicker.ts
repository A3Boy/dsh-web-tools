/**
 * dsh-web-tools — the `web_search` result card: interactive SocialPostPicker.
 *
 * Implements the native post picker UI matching the design specification:
 * - Header with total post count and platform distribution badge.
 * - Horizontal cards with fixed-ratio cover images (or clean empty text post placeholder).
 * - Platform badges (Xiaohongshu red, X dark), author, relative dates.
 * - 2-line clamped title and summary.
 * - Engagement stats with official primitives SVG icons (IconLikeOutline16, IconSparkle16,
 *   IconQueueOutline14, IconRefreshOutline14) — ZERO emojis.
 * - Action buttons: Primary [深入了解 ↗] triggering deep-reading in the next turn,
 *   and Secondary [查看原帖] opening the post in a new tab.
 * - Footer with summary and raw toggle.
 * @module
 */
import * as React from "react";
import {
  IconLikeOutline16,
  IconRefreshOutline14,
  IconRightUpOutline14,
  IconSparkle16,
  IconQueueOutline14,
  IconSearchOutline16,
} from "./icons.ts";
import {
  parseSearchResult,
  shortCount,
  relativeDate,
  type PostPreview,
} from "./social-post-picker-model.ts";

export { parseSearchResult, shortCount, relativeDate, type PostPreview };

const CSS = `
.wt-picker {
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  padding: 18px 20px 14px;
  color: var(--dsw-alias-label-primary, #0f1419);
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.wt-picker-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  color: var(--dsw-alias-label-secondary, #606770);
  font-size: 13px;
}
.wt-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.wt-picker-title {
  font-weight: 600;
  font-size: 16px;
  line-height: 24px;
  color: var(--dsw-alias-label-primary, #0f1419);
}
.wt-picker-count {
  flex: 0 0 auto;
  padding: 3px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-overlay, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-secondary, #606770);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.wt-picker-sub {
  margin-top: 4px;
  color: var(--dsw-alias-label-tertiary, #8a919e);
  font-size: 13px;
  line-height: 20px;
}
.wt-picker-rows {
  margin-top: 14px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
}
.wt-post {
  display: flex;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
}
.wt-post-cover {
  flex: 0 0 auto;
  width: 168px;
  height: 120px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--dsw-alias-bg-overlay, rgba(0, 0, 0, 0.04));
}
.wt-post-cover-empty {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 168px;
  height: 120px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-overlay, rgba(0, 0, 0, 0.04));
  color: var(--dsw-alias-label-tertiary, #8a919e);
}
.wt-post-cover-empty strong {
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
  color: var(--dsw-alias-label-secondary, #444950);
}
.wt-post-cover-empty span {
  font-size: 12px;
  line-height: 18px;
}
.wt-post-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
}
.wt-post-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--dsw-alias-label-tertiary, #8a919e);
  font-size: 12px;
  line-height: 18px;
}
.wt-post-platform {
  font-weight: 600;
}
.wt-post-dot {
  opacity: 0.45;
}
.wt-post-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
  color: var(--dsw-alias-label-primary, #0f1419);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wt-post-summary {
  color: var(--dsw-alias-label-secondary, #606770);
  font-size: 13px;
  line-height: 20px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wt-post-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--dsw-alias-label-tertiary, #8a919e);
  font-size: 12px;
  line-height: 18px;
  margin-top: 2px;
}
.wt-post-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.wt-post-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.wt-pbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1419);
  border: 1px solid var(--dsw-alias-border-l3, #e3e3e6);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.wt-pbtn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}
.wt-pbtn-primary {
  color: var(--dsw-alias-link, #4176e6);
  border-color: color-mix(in srgb, var(--dsw-alias-link, #4176e6) 40%, transparent);
}
.wt-pbtn-primary:hover {
  background: color-mix(in srgb, var(--dsw-alias-link, #4176e6) 8%, transparent);
}
.wt-pbtn:focus-visible {
  outline: 2px solid var(--dsw-alias-link, #4176e6);
  outline-offset: 2px;
}
.wt-picker-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
  color: var(--dsw-alias-label-tertiary, #8a919e);
  font-size: 12px;
  line-height: 18px;
}
.wt-picker-link {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  margin-left: 8px;
  color: var(--dsw-alias-label-tertiary, #8a919e);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.wt-picker-link:hover {
  color: var(--dsw-alias-label-secondary, #606770);
}
.wt-picker-raw {
  margin-top: 10px;
  max-height: 220px;
  overflow: auto;
  padding: 10px;
  border-radius: 10px;
  background: var(--dsw-alias-markdown-code-block, rgba(0, 0, 0, 0.03));
  font: 11px/19px monospace;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dsw-alias-label-secondary, #606770);
}
@media (max-width: 640px) {
  .wt-post-cover, .wt-post-cover-empty { width: 112px; height: 84px; }
  .wt-post-title { font-size: 14px; }
}
`;

function extractTextAndMeta(props: any): { text: string; structuredSources?: any[] } {
  const block = props?.block ?? props;
  let text = "";
  if (typeof block === "string") {
    text = block;
  } else if (typeof block?.text === "string") {
    text = block.text;
  } else if (Array.isArray(block?.content)) {
    text = block.content
      .map((part: any) =>
        typeof part === "string"
          ? part
          : typeof part?.text === "string"
            ? part.text
            : ""
      )
      .filter(Boolean)
      .join("\n");
  } else if (typeof block?.output === "string") {
    text = block.output;
  }

  const structuredSources = Array.isArray(block?.meta?.sources) ? block.meta.sources : undefined;
  if (block?.meta?.answer && typeof block.meta.answer === "string") {
    text = `${block.meta.answer}\n\n${text}`;
  }
  return { text, structuredSources };
}

function sendPrompt(inputActions: any, text: string) {
  let submitted = false;
  if (inputActions && typeof inputActions.setDraft === "function") {
    try {
      inputActions.setDraft(text);
      if (typeof inputActions.submit === "function") {
        setTimeout(() => {
          try {
            inputActions.submit();
          } catch {
            /* the user can press Enter */
          }
        }, 50);
        submitted = true;
      }
    } catch {
      /* fallback to DOM */
    }
  }

  if (!submitted && typeof document !== "undefined") {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      "textarea[placeholder], textarea[data-dsh-composer], textarea"
    );
    if (textarea) {
      const proto = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
      proto?.set?.call(textarea, text);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
      setTimeout(() => {
        const submitBtn = document.querySelector<HTMLButtonElement>(
          'button[type="submit"], button[aria-label*="发送"], button[data-dsh-submit]'
        );
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        } else {
          textarea.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true })
          );
        }
      }, 50);
    }
  }
}

function Stat({ icon, value }: { icon: React.ReactNode; value?: number }) {
  const shown = shortCount(value);
  if (!shown) return null;
  return React.createElement("span", { className: "wt-post-stat" }, icon, shown);
}

/**
 * The `web_search` interactive post picker card component.
 */
export function SocialPostPicker(props: any) {
  const [showRaw, setShowRaw] = React.useState(false);

  // If call is still preparing or running:
  if (props.phase === "start" || props.phase === "preparing") {
    return React.createElement(
      "div",
      { className: "wt-picker wt-picker-loading" },
      React.createElement("style", { dangerouslySetInnerHTML: { __html: CSS } }),
      React.createElement(IconSearchOutline16, { size: 16 }),
      React.createElement("span", null, "正在搜索相关社交媒体帖子…"),
    );
  }

  const { text, structuredSources } = React.useMemo(() => extractTextAndMeta(props), [props]);
  const { posts, raw } = React.useMemo(() => parseSearchResult(text, structuredSources), [text, structuredSources]);

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
  const remaining = posts.length - shown.length;

  const inspect = (url: string) => {
    sendPrompt(props.inputActions, `详细读一下这篇：${url}`);
  };

  return React.createElement(
    "div",
    { className: "wt-picker", "data-dsh-post-picker": "" },
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
                icon: React.createElement(IconLikeOutline16, { size: 14 }),
                value: post.likes,
              }),
              React.createElement(Stat, {
                icon: React.createElement(IconSparkle16, { size: 14 }),
                value: post.collects,
              }),
              React.createElement(Stat, {
                icon: React.createElement(IconQueueOutline14, { size: 14 }),
                value: post.replies,
              }),
              React.createElement(Stat, {
                icon: React.createElement(IconRefreshOutline14, { size: 14 }),
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
                React.createElement(IconRightUpOutline14, { size: 12 }),
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
        remaining > 0 ? `还有 ${remaining} 条普通网页来源可在原搜索结果查看` : "更多来源见下方",
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

/** Text of the settled `web_search` result inside one Turn, read from Chat nodes. */
function searchTextForTurn(chat: any, turnNumber: number): string {
  try {
    const order = Array.isArray(chat?.order) ? chat.order : Array.from(chat?.order ?? []);
    let text = "";
    for (const key of order) {
      const node = chat.nodes.get(key);
      if (!node || node.kind !== "tool-call") continue;
      const data = node.data ?? {};
      if (data.turn !== turnNumber) continue;
      const root = data.root;
      if (!root || root.kind !== "tool-result" || root.name !== "web_search") continue;
      const parts = Array.isArray(root.content) ? root.content : [];
      const stepText = parts
        .map((part: any) =>
          typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "",
        )
        .filter(Boolean)
        .join("\n");
      if (stepText.trim()) text = stepText;
    }
    return text;
  } catch {
    return "";
  }
}

/**
 * The picker rendered in the Turn tail.
 *
 * The `web_search` key of `tool.call.toolview` is already occupied by the
 * shell's own row and cannot be shadowed from a plugin (both registrations
 * coexist and the shell's stays active), so the same card is mounted where a
 * plugin is guaranteed to render: below the answer, fed by the Turn's tool
 * result.
 * @param props - Turn-tail props: `turn` plus the standard `inputActions`/`useChat`.
 */
export function TurnTailPicker(props: any) {
  const chat = props.useChat((snapshot: any) => snapshot);
  const turnNumber = props?.turn?.turn;
  const text = typeof turnNumber === "number" ? searchTextForTurn(chat, turnNumber) : "";
  if (!text) return null;
  return React.createElement(SocialPostPicker, {
    phase: "result",
    block: { content: [{ type: "text", text }] },
    inputActions: props.inputActions,
  });
}