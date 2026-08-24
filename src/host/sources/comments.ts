import type { SourceComment, SourceItem } from "./types.ts";

export const MAX_FETCHED_COMMENTS = 30;
const MAX_COMMENT_TEXT_LENGTH = 800;

function compactText(value: string): { text: string; truncated: boolean } {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_COMMENT_TEXT_LENGTH) return { text: compact, truncated: false };
  return { text: `${compact.slice(0, MAX_COMMENT_TEXT_LENGTH - 1)}…`, truncated: true };
}

export function normalizeComments(
  input: SourceComment[],
  limit = MAX_FETCHED_COMMENTS,
): { comments: SourceComment[]; truncated: boolean } {
  const comments: SourceComment[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (const raw of input) {
    const compacted = compactText(raw.text || "");
    const text = compacted.text;
    if (!text) continue;
    truncated ||= compacted.truncated;
    const key = raw.id || `${raw.author?.handle || raw.author?.name || ""}\n${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (comments.length >= limit) {
      return { comments, truncated: true };
    }
    comments.push({ ...raw, text });
  }

  return { comments, truncated };
}

export function appendCommentsToItem(
  item: SourceItem,
  rawComments: SourceComment[],
  options: { heading: string; truncated?: boolean; limit?: number },
): SourceItem {
  const normalized = normalizeComments(rawComments, options.limit);
  const truncated = Boolean(options.truncated || normalized.truncated);
  if (normalized.comments.length === 0 && !truncated) return item;

  const emitted = new Set<string>();
  const lines = normalized.comments.map((comment) => {
    const nested = Boolean(comment.parentId && emitted.has(comment.parentId));
    emitted.add(comment.id);
    const author = comment.author?.handle || comment.author?.name || "Unknown user";
    const likes = typeof comment.likes === "number" ? ` (${comment.likes} likes)` : "";
    return `${nested ? "  " : ""}- ${author}${likes}: ${comment.text}`;
  });
  const suffix = truncated ? ", truncated" : "";
  const section = `## ${options.heading} (${normalized.comments.length} captured${suffix})\n\n${lines.join("\n")}`;

  return {
    ...item,
    text: `${item.text?.trim() || item.title}\n\n${section}`,
    comments: normalized.comments,
    commentsTruncated: truncated,
  };
}
