/**
 * Real DOM HTML fixture tests for Xiaohongshu & X DOM parsers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXhsSearchDom, parseXhsNoteDetailDom } from "../browser-bridge/src/sites/xiaohongshu.ts";
import { parseXTweetDom } from "../browser-bridge/src/sites/x.ts";

// Simple lightweight mock DOM Document for Node.js test environment
class MockElement {
  tagName: string;
  attributes: Record<string, string>;
  textContent: string;
  children: MockElement[];

  constructor(
    tagName: string,
    attributes: Record<string, string> = {},
    textContent = "",
    children: MockElement[] = [],
  ) {
    this.tagName = tagName;
    this.attributes = attributes;
    this.textContent = textContent;
    this.children = children;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  querySelector(selector: string): MockElement | null {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];

    const matchPart = (sel: string, el: MockElement): boolean => {
      const s = sel.trim();
      if (s === "section.note-item") {
        return el.tagName === "SECTION" && (el.attributes["class"] ?? "").includes("note-item");
      }
      if (s.startsWith("section:has")) {
        return el.tagName === "SECTION" && el.children.some((c) => c.tagName === "A");
      }
      if (s.includes('a[href*="/search_result/"]')) {
        return el.tagName === "A" && (el.attributes["href"] ?? "").includes("/search_result/");
      }
      if (s.includes('a[href*="/explore/"]')) {
        return el.tagName === "A" && (el.attributes["href"] ?? "").includes("/explore/");
      }
      if (s.includes('a[href*="/status/"]')) {
        return el.tagName === "A" && (el.attributes["href"] ?? "").includes("/status/");
      }
      if (s === 'article[data-testid="tweet"]') {
        return el.tagName === "ARTICLE" && el.attributes["data-testid"] === "tweet";
      }
      if (s === '[data-testid="tweetText"]') {
        return el.attributes["data-testid"] === "tweetText";
      }
      if (s === '[data-testid="User-Name"]') {
        return el.attributes["data-testid"] === "User-Name";
      }
      if (s === '[data-testid="like"]') {
        return el.attributes["data-testid"] === "like";
      }
      if (s === "time") {
        return el.tagName === "TIME";
      }
      if (s === "#detail-title") {
        return el.attributes["id"] === "detail-title";
      }
      if (s === "#detail-desc") {
        return el.attributes["id"] === "detail-desc";
      }
      if (s === ".username") {
        return (el.attributes["class"] ?? "").includes("username");
      }
      if (s.includes(".title")) {
        return (el.attributes["class"] ?? "").includes("title");
      }
      if (s.includes(".author")) {
        return (el.attributes["class"] ?? "").includes("author");
      }
      if (s.includes(".count")) {
        return (el.attributes["class"] ?? "").includes("count");
      }
      return false;
    };

    const matchSingle = (el: MockElement): boolean => {
      return selector.split(",").some((part) => matchPart(part, el));
    };

    const walk = (el: MockElement) => {
      if (matchSingle(el)) {
        results.push(el);
      }
      for (const child of el.children) {
        walk(child);
      }
    };

    walk(this);
    return results;
  }
}

test("DOM Fixture: parseXhsSearchDom correctly extracts note items preserving xsec_token", () => {
  const linkEl = new MockElement("A", { href: "/search_result/654321?xsec_token=SEC_TOKEN_ABC" });
  const titleEl = new MockElement("SPAN", { class: "title" }, "上海最美咖啡馆打卡");
  const authorEl = new MockElement("SPAN", { class: "author" }, "咖啡探险家");
  const countEl = new MockElement("SPAN", { class: "count" }, "1.2万");
  const footerEl = new MockElement("DIV", { class: "footer" }, "", [titleEl, authorEl, countEl]);
  const sectionEl = new MockElement("SECTION", { class: "note-item" }, "", [linkEl, footerEl]);

  sectionEl.querySelector = (sel: string) => {
    if (sel.includes("/search_result/")) return linkEl;
    if (sel.includes("title")) return titleEl;
    if (sel.includes("author")) return authorEl;
    if (sel.includes("count")) return countEl;
    return null;
  };

  const fakeDoc = {
    querySelectorAll(sel: string) {
      return [sectionEl];
    },
  };

  const items = parseXhsSearchDom(fakeDoc as unknown as Document);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "上海最美咖啡馆打卡");
  assert.equal(items[0].author, "咖啡探险家");
  assert.equal(items[0].likes, 12000);
  assert.equal(items[0].url, "https://www.xiaohongshu.com/search_result/654321?xsec_token=SEC_TOKEN_ABC");
});

test("DOM Fixture: parseXTweetDom correctly extracts tweets with testid attributes", () => {
  const doc = new MockElement("DOCUMENT", {}, "", [
    new MockElement("ARTICLE", { "data-testid": "tweet" }, "", [
      new MockElement("A", { href: "/sama/status/1234567890" }, "", []),
      new MockElement("DIV", { "data-testid": "User-Name" }, "Sam Altman @sama · 2h", []),
      new MockElement("DIV", { "data-testid": "tweetText" }, "The pace of AI progress is truly remarkable.", []),
      new MockElement("TIME", { datetime: "2026-08-20T10:00:00.000Z" }, "2h", []),
      new MockElement("DIV", { "data-testid": "like" }, "5.4K", []),
    ]),
  ]);

  const tweets = parseXTweetDom(doc as unknown as Document);
  assert.equal(tweets.length, 1);
  assert.equal(tweets[0].text, "The pace of AI progress is truly remarkable.");
  assert.equal(tweets[0].authorHandle, "@sama");
  assert.equal(tweets[0].likes, 5400);
  assert.equal(tweets[0].url, "https://x.com/sama/status/1234567890");
});
