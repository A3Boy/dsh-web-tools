/**
 * dsh-web-tools — response formatting & degradation explanations for routed sources.
 *
 * Lightweight standalone module decoupled from the Cordis host plugin entrypoint,
 * allowing both DSH Host plugin and standalone MCP Server to reuse it cleanly.
 *
 * @module
 */
import type { SourceItem, SourceFetchOutcome, SourceDegradation, SourceSearchOutcome } from "./types.ts";
import { WebToolsWebError, type WebFetchResponse } from "../registry.ts";
import { SNIPPET_MAX, SUMMARY_MAX, truncate, toSingleLine } from "../text-limits.ts";

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

export function formatUnavailablePlatformResponse(
  url: string,
  platform: string,
  errorCode: string | undefined,
  detail: string,
): WebFetchResponse {
  const content = [
    `# ${platform === "xiaohongshu" ? "小红书笔记" : "社交平台动态"}`,
    `状态：目标内容当前在平台端无法浏览${errorCode ? `（错误码 ${errorCode}）` : ""}。`,
    `访问链接：${url}`,
    `详细说明：${detail}`,
    `建议：该内容在平台服务端已被作者删除、设为私密或处于风控保护状态。专属浏览器会话已验证有效登录态，但平台拒绝了该笔记的详情访问。如需获取相关资讯，建议通过关键词发起搜索获取替代来源。`,
  ].join("\n\n");

  return {
    url,
    statusCode: 200,
    body: { kind: "text" as const, content },
    truncated: false,
    metadata: {
      title: `${platform === "xiaohongshu" ? "小红书内容" : "平台内容"}无法浏览${errorCode ? ` (${errorCode})` : ""}`,
    },
  };
}

export async function executeRoutedFetchWithRecovery(
  url: string,
  fetchFn: () => Promise<SourceFetchOutcome>,
  recoveryContext?: {
    lookupCache?: (url: string) => SourceItem | undefined;
    searchFallback?: (url: string) => Promise<string | undefined>;
  },
): Promise<WebFetchResponse> {
  const outcome = await fetchFn();
  if (outcome.item) {
    return toRoutedFetchResponse(url, outcome);
  }

  // 1. Try cache recovery
  if (recoveryContext?.lookupCache) {
    const cached = recoveryContext.lookupCache(url);
    if (cached) {
      return toRoutedFetchResponse(url, {
        item: {
          ...cached,
          text: cached.text || cached.snippet || cached.title,
        },
        retrievalMode: "degraded-web",
      });
    }
  }

  // 2. Try web search excerpt recovery
  if (recoveryContext?.searchFallback && outcome.error?.code === "blocked") {
    try {
      const snippet = await recoveryContext.searchFallback(url);
      if (snippet) {
        return toRoutedFetchResponse(url, {
          item: {
            id: url,
            title: "小红书笔记快照",
            url,
            text: snippet,
            platform: "xiaohongshu",
          },
          retrievalMode: "degraded-web",
        });
      }
    } catch {}
  }

  // 3. Graceful degradation for platform 300031 / access restrictions
  if (
    outcome.error?.code === "blocked" &&
    (outcome.error.message.includes("300031") ||
      outcome.error.message.includes("无法浏览") ||
      outcome.error.message.includes("redirected away"))
  ) {
    return formatUnavailablePlatformResponse(
      url,
      "xiaohongshu",
      "300031",
      "当前笔记暂时无法浏览，可能已被作者删除、设为私密或处于风控保护状态。专属浏览器会话已验证有效登录态，但平台拒绝了该笔记的详情访问。",
    );
  }

  return toRoutedFetchResponse(url, outcome);
}

const PLATFORM_DISPLAY_NAME: Record<string, string> = {
  xiaohongshu: "Xiaohongshu",
  x: "X (Twitter)",
};

/**
 * One-line, model-facing explanation of a degraded platform search.
 * When target is "mcp", provides the CLI login command rather than pointing to DSH settings.
 */
export function describeDegradation(d: SourceDegradation, target: "dsh" | "mcp" = "dsh"): string {
  const platform = d.platform ? PLATFORM_DISPLAY_NAME[d.platform] ?? d.platform : "the platform";
  const reason =
    d.code === "auth-required" || d.code === "auth-expired"
      ? `there is no signed-in ${platform} browser session`
      : d.code === "platform-disabled"
        ? `${platform} is disabled in configuration`
        : d.code === "parse-failed" || d.code === "blocked"
          // The platform served an error/verification page instead of results.
          // Saying "sign in" here sends the user down the wrong path.
          ? `${platform} returned an error page instead of search results (usually a rate limit, a captcha, or an IP block)`
          : `${platform} native search failed (${d.code})`;
  const authRelated =
    d.code === "auth-required" || d.code === "auth-expired" || d.code === "platform-disabled";
  const action = !authRelated
    ? "Retry later; if it keeps happening, the platform is rejecting this network."
    : target === "mcp"
      ? `Run \`dsh-web-tools-mcp --login ${d.platform ?? "xiaohongshu"}\` to sign in for native results.`
      : `Sign in to ${platform} in the dsh-web-tools settings card for native results.`;
  return (
    `Note: ${reason}, so the results below come from a site:-filtered general web search — ` +
    `they may be older and are not in-app content. ${action}`
  );
}

/**
 * Format concise, single-line snippet (≤200 code points) for UI card display.
 */
export function formatPlatformSnippet(item: SourceItem): string {
  const parts: string[] = [];
  const author = item.author?.handle ? `@${item.author.handle}` : item.author?.name;
  if (author) parts.push(`[${author}]`);

  const metrics: string[] = [];
  if (typeof item.likes === "number") metrics.push(`likes ${item.likes}`);
  if (typeof item.collects === "number") metrics.push(`collects ${item.collects}`);
  if (typeof item.retweets === "number") metrics.push(`retweets ${item.retweets}`);
  if (typeof item.replies === "number") metrics.push(`replies ${item.replies}`);
  if (metrics.length > 0) parts.push(metrics.join(" | "));

  if (item.tags && item.tags.length > 0) {
    parts.push(item.tags.map((t) => `#${t}`).join(" "));
  }

  const prefix = parts.length > 0 ? parts.join(" ") + " · " : "";
  const body = toSingleLine(item.snippet || item.text || "");
  return truncate(`${prefix}${body}`.trim(), SNIPPET_MAX);
}

/**
 * Format full rich digest (≤800 code points) for model-facing summary in DSH tool-web / MCP.
 */
export function formatPlatformDigest(item: SourceItem): string {
  const sections: string[] = [];
  const parts: string[] = [];
  const author = item.author?.handle ? `@${item.author.handle}` : item.author?.name;
  if (author) parts.push(`[${author}]`);

  const metrics: string[] = [];
  if (typeof item.likes === "number") metrics.push(`likes ${item.likes}`);
  if (typeof item.collects === "number") metrics.push(`collects ${item.collects}`);
  if (typeof item.retweets === "number") metrics.push(`retweets ${item.retweets}`);
  if (typeof item.replies === "number") metrics.push(`replies ${item.replies}`);
  if (metrics.length > 0) parts.push(metrics.join(" | "));

  if (item.tags && item.tags.length > 0) {
    parts.push(item.tags.map((t) => `#${t}`).join(" "));
  }
  if (parts.length > 0) sections.push(parts.join(" "));

  // Cover image: the model-facing summary is what the agent turns into a
  // candidate card, and a platform post is often judged by its picture, not its
  // title. The URL is already extracted (and, for 小红书, already rewritten to
  // the watermark-free node), so this costs no extra request.
  const cover = item.coverImage || item.images?.[0];
  if (cover) sections.push(`Cover: ${cover}`);

  const body = (item.text || item.snippet || "").trim();
  if (body) sections.push(body);

  return truncate(sections.join("\n\n").trim(), SUMMARY_MAX);
}

export interface RoutedSearchResponseOptions {
  target?: "dsh" | "mcp";
}

/**
 * Maps a SourceSearchOutcome into the normalized WebSearchResult shape,
 * preserving top-level content, degradation notices, publishedAt, snippet, and summary.
 */
export function toRoutedSearchResponse(
  outcome: SourceSearchOutcome,
  options: RoutedSearchResponseOptions = {},
) {
  const target = options.target ?? "dsh";
  const degradationNote = outcome.degraded ? describeDegradation(outcome.degraded, target) : undefined;

  // DSH's web_search renderer forwards only url/title/snippet/publishedAt of
  // each source, so a per-source `summary` never reaches the model. Covers are
  // therefore announced in the top-level content, indexed to match the source
  // list, so the model can offer "which one should I read?" with pictures.
  const nativeOverall =
    !outcome.degraded &&
    (outcome.retrievalMode === "native-browser" || outcome.retrievalMode === undefined);
  const coverLines = nativeOverall
    ? outcome.items
        .map((item, index) => ({ item, position: index + 1 }))
        .filter(({ item }) => item.platform !== "general" && (item.coverImage || item.images?.[0]))
        .slice(0, 8)
        .map(({ item, position }) => `${position}. ${item.coverImage || item.images?.[0]}`)
    : [];
  const coverBlock = coverLines.length > 0
    ? `Covers (index matches the source order below):\n${coverLines.join("\n")}`
    : undefined;

  const mergedContent =
    [degradationNote, outcome.content, coverBlock].filter(Boolean).join("\n\n") || undefined;

  return {
    ...(mergedContent ? { content: mergedContent } : {}),
    ...(outcome.degraded ? { degraded: outcome.degraded } : {}),
    ...(outcome.diagnostics ? { diagnostics: outcome.diagnostics } : {}),
    sources: outcome.items.map((item) => {
      const isNativePlatform =
        (outcome.retrievalMode === "native-browser" ||
          (outcome.retrievalMode === undefined && !outcome.degraded)) &&
        item.platform !== "general";
      const snippet = isNativePlatform
        ? formatPlatformSnippet(item)
        : truncate(toSingleLine(item.snippet ?? ""), SNIPPET_MAX);
      const summary =
        item.summary !== undefined
          ? truncate(item.summary, SUMMARY_MAX)
          : isNativePlatform
            ? formatPlatformDigest(item)
            : undefined;
      return {
        url: item.url,
        title: item.title,
        snippet,
        ...(summary !== undefined ? { summary } : {}),
        ...(item.publishedAt !== undefined ? { publishedAt: item.publishedAt } : {}),
      };
    }),
    truncated: false,
    ...(outcome.backend !== undefined ? { backend: outcome.backend } : {}),
    ...(outcome.attempts !== undefined ? { attempts: outcome.attempts } : {}),
    ...(outcome.fused !== undefined ? { fused: outcome.fused } : {}),
  };
}
