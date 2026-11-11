import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSearchResult,
  platformOf,
  shortCount,
  relativeDate,
} from "../src/client/social-post-picker-model.ts";

test("platformOf identifies Xiaohongshu and X hostnames", () => {
  assert.equal(platformOf("https://www.xiaohongshu.com/discovery/item/123")?.label, "小红书");
  assert.equal(platformOf("https://xhslink.com/a/abc")?.label, "小红书");
  assert.equal(platformOf("https://x.com/citywalknotes/status/456")?.label, "X");
  assert.equal(platformOf("https://twitter.com/user/status/789")?.label, "X");
  assert.equal(platformOf("https://example.com/some/article"), undefined);
});

test("shortCount converts numbers accurately without emojis", () => {
  assert.equal(shortCount(undefined), undefined);
  assert.equal(shortCount(93), "93");
  assert.equal(shortCount(856), "856");
  assert.equal(shortCount(1000), "1k");
  assert.equal(shortCount(1200), "1.2k");
  assert.equal(shortCount(10000), "1w");
  assert.equal(shortCount(44820), "4.5w");
});

test("relativeDate formats ISO / date strings into friendly text", () => {
  assert.equal(relativeDate(undefined), undefined);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  assert.equal(relativeDate(todayStr), "今天");

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal(relativeDate(yesterday), "昨天");

  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  assert.equal(relativeDate(threeDaysAgo), "3 天前");
});

test("parseSearchResult parses markdown output containing Covers and Sources", () => {
  const text = `
Covers (index matches the source order below):
1. https://sns-img-hw.xhscdn.com/cover1.jpg
2. https://sns-img-hw.xhscdn.com/cover2.jpg

Sources:
- [西湖边这家树荫小院，坐一下午也不腻](https://www.xiaohongshu.com/discovery/item/note1) — [@momo] likes 1200 | collects 206 | replies 37 #西湖咖啡 #发呆好去处 (2026-11-10) · 藏在满觉陇附近的小院，整理了座位体验、饮品价格和最适合发呆的时间段。
- [不踩雷！西湖附近 6 家适合独处的茶馆](https://www.xiaohongshu.com/discovery/item/note2) — [@小鹿同学] likes 856 | collects 1100 | replies 62 (2026-11-08) · 附步行路线、价格范围和实地体验。标出了周末人少、适合安静看书的座位。
- [西湖晨间散步：咖啡馆与避开人流的路线](https://x.com/citywalknotes/status/123456789) — [@citywalknotes] likes 93 | retweets 18 | replies 12 (2026-11-09) · 分享了早上八点前的沿湖步行体验，以及两处安静的咖啡休息点。
- [西湖旅游攻略官网](https://hangzhou.gov.cn/travel) — 官方西湖旅游指南。
`;

  const { posts } = parseSearchResult(text);
  assert.equal(posts.length, 3, "should parse exactly the 3 social platform posts");

  // Post 1 (Xiaohongshu with image cover)
  assert.equal(posts[0].platform.label, "小红书");
  assert.equal(posts[0].title, "西湖边这家树荫小院，坐一下午也不腻");
  assert.equal(posts[0].author, "momo");
  assert.equal(posts[0].likes, 1200);
  assert.equal(posts[0].collects, 206);
  assert.equal(posts[0].replies, 37);
  assert.equal(posts[0].cover, "https://sns-img-hw.xhscdn.com/cover1.jpg");
  assert.ok(posts[0].summary.includes("藏在满觉陇附近的小院"));

  // Post 2 (Xiaohongshu)
  assert.equal(posts[1].platform.label, "小红书");
  assert.equal(posts[1].author, "小鹿同学");
  assert.equal(posts[1].likes, 856);
  assert.equal(posts[1].collects, 1100);
  assert.equal(posts[1].cover, "https://sns-img-hw.xhscdn.com/cover2.jpg");

  // Post 3 (X text post without image)
  assert.equal(posts[2].platform.label, "X");
  assert.equal(posts[2].author, "citywalknotes");
  assert.equal(posts[2].likes, 93);
  assert.equal(posts[2].retweets, 18);
  assert.equal(posts[2].replies, 12);
  assert.equal(posts[2].cover, undefined, "text post has no cover image");
});

test("parseSearchResult also supports legacy emoji metrics in snippets", () => {
  const text = `
Sources:
- [测试帖子](https://www.xiaohongshu.com/discovery/item/test1) — [@testuser] 👍 500 | ⭐ 120 | 💬 30 · 测试摘要内容
`;
  const { posts } = parseSearchResult(text);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].likes, 500);
  assert.equal(posts[0].collects, 120);
  assert.equal(posts[0].replies, 30);
});

test("parseSearchResult supports structuredSources via block.meta", () => {
  const structuredSources = [
    {
      url: "https://www.xiaohongshu.com/discovery/item/note1",
      title: "结构化标题",
      snippet: "[@struct_author] likes 999 | collects 88 · 结构化正文摘要",
      publishedAt: "2026-11-10",
      coverImage: "https://sns-img-hw.xhscdn.com/structured.png",
    },
  ];

  const { posts } = parseSearchResult("", structuredSources);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, "结构化标题");
  assert.equal(posts[0].author, "struct_author");
  assert.equal(posts[0].likes, 999);
  assert.equal(posts[0].collects, 88);
  assert.equal(posts[0].cover, "https://sns-img-hw.xhscdn.com/structured.png");
});
