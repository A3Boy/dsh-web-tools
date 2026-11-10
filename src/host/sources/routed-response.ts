/**
 * dsh-web-tools — response formatting & degradation explanations for routed sources.
 *
 * Lightweight standalone module decoupled from the Cordis host plugin entrypoint,
 * allowing both DSH Host plugin and standalone MCP Server to reuse it cleanly.
 *
 * @module
 */
import type { SourceItem, SourceFetchOutcome, SourceDegradation } from "./types.ts";
import { WebToolsWebError, type WebFetchResponse } from "../registry.ts";

export function toRoutedFetchResponse(url: string, outcome: SourceFetchOutcome): WebFetchResponse {
  if (outcome.error) {
    const error = new WebToolsWebError(
      `platform fetch failed (${outcome.error.code}): ${outcome.error.message}`,
    );
    if (outcome.error.code === "aborted") error.code = "WEB_ABORTED";
    throw error;
  }

  const item = outcome.item;
  const rawContent = item?.text?.trim();
  if (!item || !rawContent) {
    throw new WebToolsWebError(`platform fetch returned empty content for ${url}`);
  }

  const sections: string[] = [];
  if (item.title?.trim() && !rawContent.startsWith(item.title.trim())) {
    sections.push(`# ${item.title.trim()}`);
  }

  const metadata: string[] = [];
  const author = item.author?.handle || item.author?.name;
  if (author) metadata.push(`Author: ${author}`);
  if (item.publishedAt) metadata.push(`Published: ${item.publishedAt}`);
  const engagement = [
    typeof item.likes === "number" ? `likes ${item.likes}` : undefined,
    typeof item.collects === "number" ? `collects ${item.collects}` : undefined,
    typeof item.retweets === "number" ? `retweets ${item.retweets}` : undefined,
    typeof item.replies === "number" ? `comments/replies ${item.replies}` : undefined,
  ].filter(Boolean);
  if (engagement.length > 0) metadata.push(`Engagement: ${engagement.join(", ")}`);
  if (metadata.length > 0) sections.push(metadata.join("\n"));
  sections.push(rawContent);
  if (item.images?.length) sections.push(`Images: ${item.images.length} attached`);
  const content = sections.join("\n\n");

  return {
    url,
    statusCode: 200,
    body: { kind: "text" as const, content },
    truncated: false,
    metadata: {
      title: item.title,
      author: author,
      publishedAt: item.publishedAt,
    },
  };
}

const PLATFORM_DISPLAY_NAME: Record<string, string> = {
  xiaohongshu: "Xiaohongshu",
  x: "X (Twitter)",
};

/**
 * One-line, model-facing explanation of a degraded platform search.
 */
export function describeDegradation(d: SourceDegradation): string {
  const platform = d.platform ? PLATFORM_DISPLAY_NAME[d.platform] ?? d.platform : "the platform";
  const reason =
    d.code === "auth-required" || d.code === "auth-expired"
      ? `there is no signed-in ${platform} browser session`
      : d.code === "platform-disabled"
        ? `${platform} is disabled in the dsh-web-tools settings card`
        : `${platform} native search failed (${d.code})`;
  return (
    `Note: ${reason}, so the results below come from a site:-filtered general web search — ` +
    `they may be older and are not in-app content. Sign in to ${platform} in the dsh-web-tools settings card for native results.`
  );
}

/**
 * Format rich author, metrics, and snippet text for a platform item.
 */
export function formatPlatformSnippet(item: SourceItem): string {
  const parts: string[] = [];
  const author = item.author?.handle ? `@${item.author.handle}` : item.author?.name;
  if (author) parts.push(`[${author}]`);

  const metrics: string[] = [];
  if (typeof item.likes === "number") metrics.push(`👍 ${item.likes}`);
  if (typeof item.collects === "number") metrics.push(`⭐ ${item.collects}`);
  if (typeof item.retweets === "number") metrics.push(`🔁 ${item.retweets}`);
  if (typeof item.replies === "number") metrics.push(`💬 ${item.replies}`);
  if (metrics.length > 0) parts.push(metrics.join(" | "));

  if (item.tags && item.tags.length > 0) {
    parts.push(item.tags.map((t) => `#${t}`).join(" "));
  }

  const prefix = parts.length > 0 ? parts.join(" ") + "\n" : "";
  const body = (item.snippet || item.text || "").trim();
  const full = `${prefix}${body}`.trim();
  return full.length > 1500 ? full.slice(0, 1500) + "…" : full;
}
