import { test } from "node:test";
import assert from "node:assert/strict";
import { bm25Scores, tokenize } from "../src/host/read/rank.ts";

test("tokenize lowercases Latin text, keeps digits, drops single letters and stopwords", () => {
  assert.deepEqual(tokenize("Hello, World 2026"), ["hello", "world", "2026"]);
  assert.deepEqual(tokenize("a b c 1"), ["1"]);
  assert.ok(!tokenize("the cat").includes("the"));
});

test("tokenize emits CJK unigrams and bigrams and drops particles", () => {
  const zh = tokenize("小红书评论");
  for (const t of ["小", "红", "书", "评", "论", "小红", "红书", "书评", "评论"]) assert.ok(zh.includes(t), t);
  const t2 = tokenize("苹果的价格");
  assert.ok(!t2.includes("的"));
  assert.ok(!t2.includes("果的"));
  assert.ok(t2.includes("苹果") && t2.includes("价格"));
});

test("tokenize normalises full-width forms", () => {
  assert.deepEqual(tokenize("ＡＩ　Ｍｏｄｅｌ"), ["ai", "model"]);
});

test("tokenize splits mixed Latin and CJK runs", () => {
  const t = tokenize("iPhone15评测");
  assert.ok(t.includes("iphone15"));
  assert.ok(t.includes("评测"));
});

test("bm25 ranks the chunk containing the rare query terms first", () => {
  const docs = [
    { text: "The quick brown fox jumps over the lazy dog" },
    { text: "Playwright is a browser automation library for testing" },
    { text: "Cats and dogs are common pets" },
  ];
  const s = bm25Scores(docs, "playwright browser automation");
  assert.ok(s[1] > s[0] && s[1] > s[2]);
  assert.equal(s[0], 0);
  assert.equal(s[2], 0);
});

test("bm25 matches Chinese queries through bigrams", () => {
  const docs = [{ text: "评论区热评第一条很有意思" }, { text: "笔记正文介绍了产品参数" }, { text: "完全无关的内容" }];
  const s = bm25Scores(docs, "评论区热评");
  assert.ok(s[0] > 0);
  assert.ok(s[0] > s[1] && s[0] > s[2]);
});

test("heading text boosts a chunk whose body lacks the term", () => {
  const docs = [
    { text: "setup instructions for the tool", heading: "Docker deployment" },
    { text: "setup instructions for the tool", heading: "Introduction" },
  ];
  const s = bm25Scores(docs, "docker");
  assert.ok(s[0] > 0);
  assert.equal(s[1], 0);
});

test("empty query or no docs yields zeros", () => {
  assert.deepEqual(bm25Scores([{ text: "abc def" }], ""), [0]);
  assert.deepEqual(bm25Scores([], "abc"), []);
});
