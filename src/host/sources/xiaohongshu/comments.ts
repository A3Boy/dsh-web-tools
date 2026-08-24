import type { SourceComment } from "../types.ts";

interface XhsCommentParseResult {
  comments: SourceComment[];
  truncated: boolean;
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" ? value as Record<string, any> : undefined;
}

function parseTimestamp(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const milliseconds = value > 1e12 ? value : value * 1000;
  return new Date(milliseconds).toISOString();
}

function parseCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOne(raw: unknown, parentId?: string): SourceComment | undefined {
  const comment = asRecord(raw);
  if (!comment) return undefined;
  const id = String(comment.id || comment.comment_id || "").trim();
  const text = String(comment.content || comment.text || "").trim();
  if (!id || !text) return undefined;
  const user = asRecord(comment.user_info || comment.userInfo || comment.user);
  const userId = user?.user_id || user?.userId;
  const handle = user?.nickname || user?.nick_name || user?.name;

  return {
    id,
    text,
    parentId,
    author: handle || userId
      ? {
          name: handle || String(userId),
          url: userId
            ? `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(String(userId))}`
            : undefined,
        }
      : undefined,
    publishedAt: parseTimestamp(comment.create_time || comment.createTime),
    likes: parseCount(comment.like_count ?? comment.likeCount),
  };
}

/** Parse the browser's own comment-page JSON response without calling private APIs. */
export function extractXhsComments(value: unknown): XhsCommentParseResult {
  const root = asRecord(value);
  const data = asRecord(root?.data) || root;
  const rawComments = data?.comments || data?.comment_list || data?.commentList;
  if (!Array.isArray(rawComments)) return { comments: [], truncated: false };

  const comments: SourceComment[] = [];
  let truncated = Boolean(data?.has_more ?? data?.hasMore);

  for (const raw of rawComments) {
    const top = parseOne(raw);
    if (!top) continue;
    comments.push(top);
    const record = asRecord(raw);
    const subComments = record?.sub_comments || record?.subComments || [];
    if (Array.isArray(subComments)) {
      for (const sub of subComments) {
        const reply = parseOne(sub, top.id);
        if (reply) comments.push(reply);
      }
      const subCount = parseCount(record?.sub_comment_count ?? record?.subCommentCount);
      if (typeof subCount === "number" && subCount > subComments.length) truncated = true;
    }
  }

  return { comments, truncated };
}
