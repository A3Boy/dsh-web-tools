import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MAX_CHARS,
  MIN_MAX_CHARS,
  OUTLINE_LIMIT,
  UnknownSectionError,
  readPage,
} from "../src/host/read/pipeline.ts";

function buildDoc(): string {
  const parts = ["# Guide to Widgets", "Widgets are small things used everywhere."];
  for (let i = 1; i <= 20; i++) parts.push(`## Chapter ${i}`, `Filler text for chapter ${i}. `.repeat(40));
  parts.push("## Pricing", "The enterprise plan costs 49 dollars per seat per month with annual billing.");
  return parts.join("\n\n");
}

test("focus returns the relevant passage within the budget and lists the outline", () => {
  const r = readPage(buildDoc(), { focus: "enterprise plan cost per seat", maxChars: 1500 });
  assert.equal(r.focusMatched, true);
  assert.ok(r.passages.some((p) => p.text.includes("49 dollars")));
  assert.ok(r.returnedChars <= 1500);
  assert.ok(r.outline.some((o) => o.heading === "Pricing"));
  assert.equal(r.title, "Guide to Widgets");
  assert.equal(r.truncated, true);
});

test("without focus returns the page start, not an arbitrary slice", () => {
  const r = readPage(buildDoc());
  assert.equal(r.focusMatched, false);
  assert.ok(r.passages[0].text.includes("Widgets are small things"));
  assert.ok(r.returnedChars <= 3000);
});

test("a focus with no match falls back to the page start", () => {
  const r = readPage(buildDoc(), { focus: "zebra xylophone" });
  assert.equal(r.focusMatched, false);
  assert.ok(r.passages[0].text.includes("Widgets are small things"));
});

test("section mode returns only that section", () => {
  const doc = buildDoc();
  const pricing = readPage(doc).outline.find((o) => o.heading === "Pricing")!;
  const r = readPage(doc, { section: pricing.id });
  assert.deepEqual(r.section, { id: pricing.id, heading: "Pricing" });
  assert.ok(r.passages.length > 0);
  assert.ok(r.passages.every((p) => p.sectionId === pricing.id));
  assert.ok(r.passages.some((p) => p.text.includes("49 dollars")));
  assert.equal(r.truncated, false);
});

test("section ids are stable across calls", () => {
  const doc = buildDoc();
  assert.deepEqual(readPage(doc).outline, readPage(doc, { focus: "pricing" }).outline);
});

test("an unknown section raises UnknownSectionError with a stable code", () => {
  assert.throws(
    () => readPage(buildDoc(), { section: "s999" }),
    (err: unknown) => err instanceof UnknownSectionError && err.code === "UNKNOWN_SECTION" && err.available.length > 0,
  );
});

test("maxChars is clamped to the supported range", () => {
  const doc = buildDoc();
  assert.ok(readPage(doc, { focus: "chapter", maxChars: 10 }).returnedChars <= MIN_MAX_CHARS);
  assert.ok(readPage(doc, { focus: "chapter", maxChars: 10 ** 9 }).returnedChars <= MAX_MAX_CHARS);
  assert.ok(readPage(doc, { focus: "chapter", maxChars: Number.NaN }).returnedChars <= 6000);
});

test("outline is capped and reports the total", () => {
  const md = Array.from({ length: 80 }, (_, i) => `## Heading ${i}\n\nbody ${i}`).join("\n\n");
  const r = readPage(md);
  assert.equal(r.outline.length, OUTLINE_LIMIT);
  assert.equal(r.outlineTotal, 80);
});

test("title falls back to the first line when there is no H1", () => {
  assert.equal(readPage("Just a line of text\n\nmore").title, "Just a line of text");
  assert.equal(readPage("").title, undefined);
});

test("Chinese focus finds the relevant Chinese passage", () => {
  const md = [
    "# 产品评测",
    "这是一篇关于某款耳机的评测文章。",
    "## 音质",
    "高频清晰，低频下潜足够，整体偏暖。".repeat(30),
    "## 续航",
    "官方标称续航三十小时，实测大约二十六小时。",
  ].join("\n\n");
  const r = readPage(md, { focus: "续航多少小时", maxChars: 800 });
  assert.equal(r.focusMatched, true);
  assert.ok(r.passages.some((p) => p.text.includes("实测大约二十六小时")));
});

test("a large page is processed quickly", () => {
  const md = "# Big\n\n" + "lorem ipsum dolor sit amet ".repeat(16000); // ~430k chars
  const start = Date.now();
  const r = readPage(md, { focus: "dolor" });
  assert.ok(Date.now() - start < 5000);
  assert.ok(r.returnedChars <= 6000);
});
