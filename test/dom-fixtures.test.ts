import assert from "node:assert/strict";
import test from "node:test";
import { extractVisibleXhsSearch } from "../src/host/sources/browser-scripts/xiaohongshu.ts";
import { extractVisibleXTweets } from "../src/host/sources/browser-scripts/x.ts";

test("DOM Fixture: extractVisibleXhsSearch correctly extracts note items preserving xsec_token", () => {
  const fakeHtml = `
    <section class="note-item">
      <a class="cover" href="/search_result/65f123456789abcdef012345?xsec_token=CB123456789abcdef&xsec_source=pc_search">
        <img class="cover" src="https://ci.xiaohongshu.com/cover.jpg" />
      </a>
      <div class="footer">
        <a class="title"><span>东京小众咖啡馆推荐</span></a>
        <div class="author-wrapper">
          <a class="author" href="/user/profile/5a123456">
            <span class="name">东京探店达人</span>
          </a>
          <span class="like-wrapper">
            <span class="count">1.2万</span>
          </span>
        </div>
      </div>
    </section>
  `;

  (globalThis as any).document = {
    querySelectorAll: (selector: string) => {
      if (selector === "section.note-item") {
        return [
          {
            querySelector: (sel: string) => {
              if (sel === "a.cover" || sel.includes("/search_result/")) {
                return {
                  getAttribute: (attr: string) =>
                    attr === "href"
                      ? "/search_result/65f123456789abcdef012345?xsec_token=CB123456789abcdef&xsec_source=pc_search"
                      : null,
                };
              }
              if (sel === ".title span" || sel === ".footer .title" || sel === ".title") {
                return { textContent: "东京小众咖啡馆推荐" };
              }
              if (sel.includes("author") && sel.includes(".name")) {
                return { textContent: "东京探店达人" };
              }
              if (sel.includes("author")) {
                return { getAttribute: (attr: string) => (attr === "href" ? "/user/profile/5a123456" : null) };
              }
              if (sel.includes(".like-wrapper") || sel === ".count") {
                return { textContent: "1.2万" };
              }
              if (sel.includes("img")) {
                return { getAttribute: () => "https://ci.xiaohongshu.com/cover.jpg" };
              }
              return null;
            },
          },
        ];
      }
      return [];
    },
  };

  const results = extractVisibleXhsSearch();
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "65f123456789abcdef012345");
  assert.ok(results[0].url.includes("xsec_token=CB123456789abcdef"));
  assert.equal(results[0].title, "东京小众咖啡馆推荐");
  assert.equal(results[0].authorName, "东京探店达人");
  assert.equal(results[0].likes, 12000);
});

test("DOM Fixture: extractVisibleXTweets correctly extracts tweets with testid attributes", () => {
  (globalThis as any).document = {
    querySelectorAll: (selector: string) => {
      if (selector === "article[data-testid='tweet']") {
        return [
          {
            querySelector: (sel: string) => {
              if (sel === "time") {
                return {
                  closest: () => ({ getAttribute: () => "https://x.com/karpathy/status/1760000000000000000" }),
                  getAttribute: () => "2025-02-20T12:00:00.000Z",
                };
              }
              if (sel === "[data-testid='tweetText']") {
                return { textContent: "The hottest new programming language is English." };
              }
              if (sel === "[data-testid='User-Name']") {
                return { textContent: "Andrej Karpathy @karpathy" };
              }
              if (sel === "[data-testid='like']") {
                return { getAttribute: () => "15.4K Likes", textContent: "15.4K" };
              }
              if (sel === "[data-testid='retweet']") {
                return { getAttribute: () => "3.2K Retweets", textContent: "3.2K" };
              }
              if (sel === "[data-testid='reply']") {
                return { getAttribute: () => "850 Replies", textContent: "850" };
              }
              return null;
            },
            querySelectorAll: () => [],
          },
        ];
      }
      return [];
    },
  };

  const results = extractVisibleXTweets();
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "1760000000000000000");
  assert.equal(results[0].authorHandle, "@karpathy");
  assert.equal(results[0].authorName, "Andrej Karpathy");
  assert.equal(results[0].text, "The hottest new programming language is English.");
  assert.equal(results[0].likes, 15400);
  assert.equal(results[0].retweets, 3200);
  assert.equal(results[0].replies, 850);
});
