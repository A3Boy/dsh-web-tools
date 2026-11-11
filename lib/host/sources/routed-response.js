import { WebToolsWebError } from "../registry.js";
import { SNIPPET_MAX, SUMMARY_MAX, truncate, toSingleLine } from "../text-limits.js";
export function toRoutedFetchResponse(url, outcome) {
    if (outcome.error) {
        const error = new WebToolsWebError(`platform fetch failed (${outcome.error.code}): ${outcome.error.message}`);
        if (outcome.error.code === "aborted")
            error.code = "WEB_ABORTED";
        throw error;
    }
    const item = outcome.item;
    const rawContent = item?.text?.trim();
    if (!item || !rawContent) {
        throw new WebToolsWebError(`platform fetch returned empty content for ${url}`);
    }
    const sections = [];
    if (item.title?.trim() && !rawContent.startsWith(item.title.trim())) {
        sections.push(`# ${item.title.trim()}`);
    }
    const metadata = [];
    const author = item.author?.handle || item.author?.name;
    if (author)
        metadata.push(`Author: ${author}`);
    if (item.publishedAt)
        metadata.push(`Published: ${item.publishedAt}`);
    const engagement = [
        typeof item.likes === "number" ? `likes ${item.likes}` : undefined,
        typeof item.collects === "number" ? `collects ${item.collects}` : undefined,
        typeof item.retweets === "number" ? `retweets ${item.retweets}` : undefined,
        typeof item.replies === "number" ? `comments/replies ${item.replies}` : undefined,
    ].filter(Boolean);
    if (engagement.length > 0)
        metadata.push(`Engagement: ${engagement.join(", ")}`);
    if (metadata.length > 0)
        sections.push(metadata.join("\n"));
    sections.push(rawContent);
    if (item.images?.length)
        sections.push(`Images: ${item.images.length} attached`);
    const content = sections.join("\n\n");
    return {
        url,
        statusCode: 200,
        body: { kind: "text", content },
        truncated: false,
        metadata: {
            title: item.title,
            author: author,
            publishedAt: item.publishedAt,
        },
    };
}
const PLATFORM_DISPLAY_NAME = {
    xiaohongshu: "Xiaohongshu",
    x: "X (Twitter)",
};
/**
 * One-line, model-facing explanation of a degraded platform search.
 * When target is "mcp", provides the CLI login command rather than pointing to DSH settings.
 */
export function describeDegradation(d, target = "dsh") {
    const platform = d.platform ? PLATFORM_DISPLAY_NAME[d.platform] ?? d.platform : "the platform";
    const reason = d.code === "auth-required" || d.code === "auth-expired"
        ? `there is no signed-in ${platform} browser session`
        : d.code === "platform-disabled"
            ? `${platform} is disabled in configuration`
            : `${platform} native search failed (${d.code})`;
    const action = target === "mcp"
        ? `Run \`dsh-web-tools-mcp --login ${d.platform ?? "xiaohongshu"}\` to sign in for native results.`
        : `Sign in to ${platform} in the dsh-web-tools settings card for native results.`;
    return (`Note: ${reason}, so the results below come from a site:-filtered general web search — ` +
        `they may be older and are not in-app content. ${action}`);
}
/**
 * Format concise, single-line snippet (≤200 code points) for UI card display.
 */
export function formatPlatformSnippet(item) {
    const parts = [];
    const author = item.author?.handle ? `@${item.author.handle}` : item.author?.name;
    if (author)
        parts.push(`[${author}]`);
    const metrics = [];
    if (typeof item.likes === "number")
        metrics.push(`👍 ${item.likes}`);
    if (typeof item.collects === "number")
        metrics.push(`⭐ ${item.collects}`);
    if (typeof item.retweets === "number")
        metrics.push(`🔁 ${item.retweets}`);
    if (typeof item.replies === "number")
        metrics.push(`💬 ${item.replies}`);
    if (metrics.length > 0)
        parts.push(metrics.join(" | "));
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
export function formatPlatformDigest(item) {
    const sections = [];
    const parts = [];
    const author = item.author?.handle ? `@${item.author.handle}` : item.author?.name;
    if (author)
        parts.push(`[${author}]`);
    const metrics = [];
    if (typeof item.likes === "number")
        metrics.push(`👍 ${item.likes}`);
    if (typeof item.collects === "number")
        metrics.push(`⭐ ${item.collects}`);
    if (typeof item.retweets === "number")
        metrics.push(`🔁 ${item.retweets}`);
    if (typeof item.replies === "number")
        metrics.push(`💬 ${item.replies}`);
    if (metrics.length > 0)
        parts.push(metrics.join(" | "));
    if (item.tags && item.tags.length > 0) {
        parts.push(item.tags.map((t) => `#${t}`).join(" "));
    }
    if (parts.length > 0)
        sections.push(parts.join(" "));
    const body = (item.text || item.snippet || "").trim();
    if (body)
        sections.push(body);
    return truncate(sections.join("\n\n").trim(), SUMMARY_MAX);
}
/**
 * Maps a SourceSearchOutcome into the normalized WebSearchResult shape,
 * preserving top-level content, degradation notices, publishedAt, snippet, and summary.
 */
export function toRoutedSearchResponse(outcome, options = {}) {
    const target = options.target ?? "dsh";
    const degradationNote = outcome.degraded ? describeDegradation(outcome.degraded, target) : undefined;
    const mergedContent = [degradationNote, outcome.content].filter(Boolean).join("\n\n") || undefined;
    return {
        ...(mergedContent ? { content: mergedContent } : {}),
        ...(outcome.degraded ? { degraded: outcome.degraded } : {}),
        ...(outcome.diagnostics ? { diagnostics: outcome.diagnostics } : {}),
        sources: outcome.items.map((item) => {
            const isNativePlatform = (outcome.retrievalMode === "native-browser" ||
                (outcome.retrievalMode === undefined && !outcome.degraded)) &&
                item.platform !== "general";
            const snippet = isNativePlatform
                ? formatPlatformSnippet(item)
                : truncate(toSingleLine(item.snippet ?? ""), SNIPPET_MAX);
            const summary = item.summary !== undefined
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
