import assert from "node:assert/strict";
import test from "node:test";
import { extractXhsSearchState, extractXhsDetailState } from "../src/host/sources/browser-scripts/xiaohongshu.ts";
import { buildXhsNoteUrl } from "../src/host/sources/xiaohongshu/query.ts";
import { parseXhsMetricNumber, isNoteFeed, normalizeXhsFeed } from "../src/host/sources/xiaohongshu/normalize.ts";
import type { XhsRawSearchFeed } from "../src/host/sources/xiaohongshu/types.ts";

test("parseXhsMetricNumber: accurately parses standard, K, 万, and 万+ formats", () => {
  assert.equal(parseXhsMetricNumber(123), 123);
  assert.equal(parseXhsMetricNumber("123"), 123);
  assert.equal(parseXhsMetricNumber("1.2K"), 1200);
  assert.equal(parseXhsMetricNumber("1.2k"), 1200);
  assert.equal(parseXhsMetricNumber("1.7万"), 17000);
  assert.equal(parseXhsMetricNumber("10万+"), 100000);
  assert.equal(parseXhsMetricNumber("99+"), 99);
  assert.equal(parseXhsMetricNumber("invalid"), undefined);
  assert.equal(parseXhsMetricNumber(undefined), undefined);
});

test("buildXhsNoteUrl: constructs safe URL preserving canonical token and params", () => {
  const url1 = buildXhsNoteUrl("65f12345", "tokenABC123");
  assert.equal(url1, "https://www.xiaohongshu.com/explore/65f12345?xsec_token=tokenABC123&xsec_source=pc_feed");

  // Special characters in token should be properly encoded in query
  const url2 = buildXhsNoteUrl("65f12345", "AB+123/xyz==");
  const parsed = new URL(url2);
  assert.equal(parsed.searchParams.get("xsec_token"), "AB+123/xyz==");
  assert.equal(parsed.searchParams.get("xsec_source"), "pc_feed");

  // Without token
  const url3 = buildXhsNoteUrl("65f12345");
  assert.equal(url3, "https://www.xiaohongshu.com/explore/65f12345");
});

test("onlyNotes / isNoteFeed: filters out live_v2 and hot_query but keeps video and normal notes", () => {
  const normalNote: XhsRawSearchFeed = {
    id: "note1",
    modelType: "note",
    noteCard: { type: "normal", displayTitle: "普通图文笔记" },
  };
  const videoNote: XhsRawSearchFeed = {
    id: "note2",
    modelType: "note",
    noteCard: { type: "video", displayTitle: "视频笔记" },
  };
  const liveFeed: XhsRawSearchFeed = {
    id: "live1",
    modelType: "live_v2",
  };
  const hotQueryFeed: XhsRawSearchFeed = {
    id: "query1",
    modelType: "hot_query",
  };

  assert.equal(isNoteFeed(normalNote), true);
  assert.equal(isNoteFeed(videoNote), true);
  assert.equal(isNoteFeed(liveFeed), false);
  assert.equal(isNoteFeed(hotQueryFeed), false);
});

test("normalizeXhsFeed: maps raw structured feed into canonical SourceItem", () => {
  const rawFeed: XhsRawSearchFeed = {
    id: "note666",
    xsecToken: "xsec999",
    modelType: "note",
    noteCard: {
      displayTitle: "Gemini 3.7 实测体验",
      user: {
        nickname: "AI探秘者",
        userId: "user12345",
      },
      interactInfo: {
        likedCount: "3.5万",
      },
      cover: {
        urlDefault: "https://ci.xiaohongshu.com/cover666.jpg",
      },
    },
  };

  const item = normalizeXhsFeed(rawFeed);
  assert.ok(item);
  assert.equal(item.id, "note666");
  assert.equal(item.title, "Gemini 3.7 实测体验");
  assert.equal(item.url, "https://www.xiaohongshu.com/explore/note666?xsec_token=xsec999&xsec_source=pc_feed");
  assert.equal(item.author?.name, "AI探秘者");
  assert.equal(item.author?.url, "https://www.xiaohongshu.com/user/profile/user12345");
  assert.equal(item.likes, 35000);
  assert.equal(item.coverImage, "https://ci.xiaohongshu.com/cover666.jpg");
  assert.equal(item.platform, "xiaohongshu");
});

test("extractXhsSearchState: extracts feeds from window.__INITIAL_STATE__.search.feeds (both value and _value)", () => {
  // Case 1: feeds.value
  (globalThis as any).window = {
    __INITIAL_STATE__: {
      search: {
        feeds: {
          value: [
            { id: "v1", modelType: "note", xsecToken: "tok1", noteCard: { displayTitle: "Val Note" } },
          ],
        },
      },
    },
  };

  const res1 = extractXhsSearchState();
  assert.equal(res1.available, true);
  assert.equal(res1.feeds.length, 1);
  assert.equal(res1.feeds[0].id, "v1");

  // Case 2: feeds._value
  (globalThis as any).window = {
    __INITIAL_STATE__: {
      search: {
        feeds: {
          _value: [
            { id: "v2", modelType: "note", xsecToken: "tok2", noteCard: { displayTitle: "UnderVal Note" } },
          ],
        },
      },
    },
  };

  const res2 = extractXhsSearchState();
  assert.equal(res2.available, true);
  assert.equal(res2.feeds.length, 1);
  assert.equal(res2.feeds[0].id, "v2");

  // Case 3: Empty feeds array (valid 0 results)
  (globalThis as any).window = {
    __INITIAL_STATE__: {
      search: {
        feeds: {
          value: [],
        },
      },
    },
  };

  const res3 = extractXhsSearchState();
  assert.equal(res3.available, true);
  assert.equal(res3.feeds.length, 0);

  // Case 4: Missing state (unavailable)
  (globalThis as any).window = {};
  const res4 = extractXhsSearchState();
  assert.equal(res4.available, false);
  assert.equal(res4.feeds.length, 0);
});

test("extractXhsDetailState: extracts note detail from noteDetailMap (direct key and Object.values fallback)", () => {
  // Case 1: Direct key match
  (globalThis as any).window = {
    __INITIAL_STATE__: {
      note: {
        noteDetailMap: {
          note_123: {
            note: {
              noteId: "note_123",
              title: "结构化笔记详情",
              desc: "正文内容很丰富",
              time: 1724400000000,
              user: { nickname: "科技达人", userId: "u_999" },
              interactInfo: { likedCount: "1.2万", collectedCount: "3500", commentCount: "88" },
              imageList: [{ urlDefault: "https://ci.xiaohongshu.com/img1.jpg" }],
            },
          },
        },
      },
    },
  };

  const res1 = extractXhsDetailState("note_123");
  assert.equal(res1.available, true);
  assert.equal(res1.title, "结构化笔记详情");
  assert.equal(res1.text, "正文内容很丰富");
  assert.equal(res1.authorName, "科技达人");
  assert.equal(res1.likes, 12000);
  assert.equal(res1.collects, 3500);
  assert.equal(res1.comments, 88);
  assert.ok(res1.publishedAt);
  assert.equal(res1.images?.[0], "https://ci.xiaohongshu.com/img1.jpg");

  // Case 2: Object.values fallback (note key is different from requested noteId)
  (globalThis as any).window = {
    __INITIAL_STATE__: {
      note: {
        noteDetailMap: {
          some_internal_key: {
            note: {
              noteId: "note_fallback_456",
              title: "Fallback 结构化详情",
              desc: "正文来自 fallback",
              user: { nickname: "Fallback作者" },
            },
          },
        },
      },
    },
  };
  const res2 = extractXhsDetailState("note_fallback_456");
  assert.equal(res2.available, true);
  assert.equal(res2.title, "Fallback 结构化详情");
  assert.equal(res2.text, "正文来自 fallback");
  assert.equal(res2.authorName, "Fallback作者");

  // Case 3: Missing entry
  const res3 = extractXhsDetailState("note_non_exist");
  assert.equal(res3.available, false);
});
