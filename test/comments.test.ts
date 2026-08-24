import assert from "node:assert/strict";
import test from "node:test";
import { appendCommentsToItem, normalizeComments } from "../src/host/sources/comments.ts";

test("comments: deduplicates, caps, and renders one line per comment", () => {
  const normalized = normalizeComments([
    { id: "1", text: " First\ncomment ", author: { name: "Alice" } },
    { id: "1", text: "duplicate", author: { name: "Alice" } },
    { id: "2", parentId: "1", text: "reply", author: { handle: "@bob" } },
    { id: "3", text: "third" },
  ], 2);

  assert.equal(normalized.comments.length, 2);
  assert.equal(normalized.comments[0].text, "First comment");
  assert.equal(normalized.truncated, true);

  const item = appendCommentsToItem({
    id: "post",
    title: "Post",
    url: "https://example.com/post",
    text: "Body",
    platform: "general",
  }, normalized.comments, { heading: "Comments", truncated: normalized.truncated });

  assert.match(item.text || "", /## Comments \(2 captured, truncated\)/);
  assert.match(item.text || "", /- Alice: First comment/);
  assert.match(item.text || "", /  - @bob: reply/);
  assert.equal(item.comments?.length, 2);
  assert.equal(item.commentsTruncated, true);
});
