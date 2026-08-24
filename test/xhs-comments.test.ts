import assert from "node:assert/strict";
import test from "node:test";
import { extractXhsComments } from "../src/host/sources/xiaohongshu/comments.ts";

test("XHS comments: parses top-level comments and embedded replies", () => {
  const result = extractXhsComments({
    data: {
      has_more: true,
      comments: [
        {
          id: "comment-1",
          content: "一级评论内容",
          create_time: 1787536800,
          like_count: "12",
          user_info: { user_id: "user-1", nickname: "甲" },
          sub_comment_count: 2,
          sub_comments: [
            {
              id: "reply-1",
              content: "逐条回复内容",
              user_info: { user_id: "user-2", nickname: "乙" },
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.comments.length, 2);
  assert.equal(result.comments[0].text, "一级评论内容");
  assert.equal(result.comments[0].author?.name, "甲");
  assert.equal(result.comments[0].likes, 12);
  assert.equal(result.comments[1].parentId, "comment-1");
  assert.equal(result.comments[1].text, "逐条回复内容");
  assert.equal(result.truncated, true, "has_more and missing sub-comments must be reported");
});

test("XHS comments: accepts camelCase response variants", () => {
  const result = extractXhsComments({
    data: {
      hasMore: false,
      commentList: [
        {
          comment_id: "comment-2",
          text: "兼容字段",
          userInfo: { userId: "user-3", name: "丙" },
          subComments: [],
        },
      ],
    },
  });

  assert.equal(result.comments[0].id, "comment-2");
  assert.equal(result.comments[0].author?.name, "丙");
  assert.equal(result.truncated, false);
});
