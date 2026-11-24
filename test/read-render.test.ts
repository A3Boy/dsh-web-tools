import { test } from "node:test";
import assert from "node:assert/strict";
import { readPage } from "../src/host/read/pipeline.ts";
import { UNTRUSTED_NOTICE, formatChars, renderWebRead } from "../src/host/read/render.ts";

const DOC = [
  "# Guide",
  "Intro paragraph.",
  "## Setup",
  "Install the thing with the package manager.",
  "### Linux",
  "Use apt.",
  "## Pricing",
  "The plan costs 49 dollars per seat.",
  "Filler. ".repeat(900),
].join("\n\n");

test("formatChars abbreviates thousands", () => {
  assert.equal(formatChars(999), "999");
  assert.equal(formatChars(1200), "1.2k");
});

test("output starts with the untrusted-content notice and names the page", () => {
  const result = readPage(DOC, { focus: "plan costs per seat", maxChars: 1000 });
  const text = renderWebRead({ url: "https://example.com/a", finalUrl: "https://example.com/b", focus: "plan costs per seat", result });
  assert.ok(text.startsWith(UNTRUSTED_NOTICE));
  assert.ok(text.includes("URL: https://example.com/b"));
  assert.ok(text.includes("Title: Guide"));
  assert.ok(text.includes('selected for focus "plan costs per seat"'));
  assert.ok(text.includes("49 dollars"));
});

test("outline is indented by level and the truncation hint names the section parameter", () => {
  const result = readPage(DOC, { focus: "plan costs per seat", maxChars: 600 });
  const text = renderWebRead({ url: "https://example.com", result });
  assert.ok(text.includes("Outline ("));
  assert.ok(/\n {2}s\d+ Setup/.test(text));
  assert.ok(/\n {4}s\d+ Linux/.test(text));
  assert.ok(text.includes('section="<id>"'));
});

test("a focus that matches nothing says so instead of pretending", () => {
  const result = readPage(DOC, { focus: "zebra xylophone" });
  const text = renderWebRead({ url: "https://example.com", focus: "zebra xylophone", result });
  assert.ok(text.includes("No passage matched the focus"));
});

test("section reads are labelled and fetch truncation is surfaced", () => {
  const first = readPage(DOC);
  const setup = first.outline.find((o) => o.heading === "Setup")!;
  const result = readPage(DOC, { section: setup.id });
  const text = renderWebRead({ url: "https://example.com", result, fetchTruncated: true });
  assert.ok(text.includes(`Section: ${setup.id} "Setup"`));
  assert.ok(text.includes("truncated by the fetch provider"));
  assert.ok(!text.includes("To read more"));
});
