import { test } from "node:test";
import assert from "node:assert/strict";
import { splitMarkdown } from "../src/host/read/chunk.ts";
import { cpLength } from "../src/host/read/text.ts";

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

test("splits on headings with sequential ids and heading paths", () => {
  const md = ["# Title", "intro text", "## Setup", "install it", "### Linux", "apt install x", "## Usage", "run it"].join("\n");
  const { sections, chunks } = splitMarkdown(md);
  assert.deepEqual(sections.map((s) => s.id), ["s0", "s1", "s2", "s3"]);
  assert.deepEqual(sections.map((s) => s.heading), ["Title", "Setup", "Linux", "Usage"]);
  assert.deepEqual(chunks.find((c) => c.sectionId === "s2")?.headingPath, ["Title", "Setup", "Linux"]);
  assert.deepEqual(chunks.find((c) => c.sectionId === "s3")?.headingPath, ["Title", "Usage"]);
});

test("keeps a preamble before the first heading and omits empty sections", () => {
  const md = ["lead text", "", "# Empty", "## Real", "body"].join("\n");
  const { sections } = splitMarkdown(md);
  assert.deepEqual(sections.map((s) => [s.id, s.heading, s.level]), [
    ["s0", "", 0],
    ["s1", "Real", 2],
  ]);
});

test("does not treat headings inside fenced code as headings", () => {
  const md = ["# Doc", "text", "```sh", "# not a heading", "echo hi", "```", "after"].join("\n");
  const { sections, chunks } = splitMarkdown(md);
  assert.equal(sections.length, 1);
  assert.ok(chunks.some((c) => c.text.includes("# not a heading")));
});

test("handles CRLF line endings", () => {
  const { sections, chunks } = splitMarkdown("# A\r\nbody line\r\n");
  assert.equal(sections[0].heading, "A");
  assert.equal(chunks[0].text, "body line");
});

test("packs small paragraphs into one chunk", () => {
  const paragraphs = Array.from({ length: 10 }, (_, i) => `short paragraph number ${i}`).join("\n\n");
  const { chunks } = splitMarkdown(`# H\n\n${paragraphs}`);
  assert.equal(chunks.length, 1);
});

test("every chunk respects the size bound and never splits a surrogate pair", () => {
  const unit = "中文😀";
  const text = unit.repeat(1000); // no punctuation, no spaces, emoji everywhere
  const { chunks } = splitMarkdown(`# H\n\n${text}`, { maxChunkChars: 200 });
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(cpLength(c.text) <= 200, `chunk too long: ${cpLength(c.text)}`);
    assert.equal(LONE_SURROGATE.test(c.text), false);
    assert.equal(c.chars, cpLength(c.text));
  }
  assert.equal(chunks.map((c) => c.text).join(""), text);
});

test("prefers sentence boundaries when splitting a long paragraph", () => {
  const text = Array.from({ length: 40 }, (_, i) => `这是第${i}句话。`).join("");
  const { chunks } = splitMarkdown(`# H\n\n${text}`, { maxChunkChars: 100 });
  assert.ok(chunks.length > 1);
  for (const c of chunks.slice(0, -1)) assert.ok(c.text.endsWith("。"), c.text.slice(-6));
});

test("splitting is deterministic", () => {
  const md = "# A\n\n" + "word ".repeat(2000) + "\n\n## B\n\n" + "其他内容。".repeat(500);
  assert.deepEqual(splitMarkdown(md), splitMarkdown(md));
});

test("cleanHeading strips emphasis and code backticks but preserves identifiers with underscores", () => {
  const md = [
    "# Document `max_connections` Guide",
    "intro",
    "## **Configuring** `vm.overcommit_memory` and *__init__*",
    "details",
    "## [API `OBJ_OFS_DELTA`](http://example.com) Reference",
    "api details",
  ].join("\n");
  const { sections } = splitMarkdown(md);
  assert.equal(sections[0].heading, "Document max_connections Guide");
  assert.equal(sections[1].heading, "Configuring vm.overcommit_memory and __init__");
  assert.equal(sections[2].heading, "API OBJ_OFS_DELTA Reference");
});

test("cleanHeading preserves asterisks in code globs, kwargs, and SQL expressions without stripping", () => {
  const md = [
    "# Finding files with `**/*.ts` glob pattern",
    "intro",
    "## Handling *args and **kwargs in Python",
    "body",
    "## SQL queries with SELECT * FROM table",
    "query details",
  ].join("\n");
  const { sections } = splitMarkdown(md);
  assert.equal(sections[0].heading, "Finding files with **/*.ts glob pattern");
  assert.equal(sections[1].heading, "Handling *args and **kwargs in Python");
  assert.equal(sections[2].heading, "SQL queries with SELECT * FROM table");
});
