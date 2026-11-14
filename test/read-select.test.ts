import { test } from "node:test";
import assert from "node:assert/strict";
import type { Chunk } from "../src/host/read/chunk.ts";
import { selectPassages } from "../src/host/read/select.ts";
import { cpLength } from "../src/host/read/text.ts";

function mk(index: number, chars: number, sectionId = "s0"): Chunk {
  return { index, id: `c${index}`, sectionId, headingPath: [], text: "x".repeat(chars), chars };
}
const indices = (sel: ReturnType<typeof selectPassages>) => sel.passages.map((p) => p.chunk.index);

test("respects the budget, includes the lead and returns document order", () => {
  const chunks = Array.from({ length: 10 }, (_, i) => mk(i, 100));
  const scores = [0, 0, 5, 0, 3, 0, 1, 0, 0, 0];
  const sel = selectPassages(chunks, scores, { budgetChars: 300 });
  assert.deepEqual(indices(sel), [0, 2, 4]); // chunk 6 (score 1) is below 30% of the best
  assert.equal(sel.returnedChars, 300);
  assert.equal(sel.focusMatched, true);
  assert.equal(sel.truncated, true);
});

test("without a match returns an in-order prefix of the page", () => {
  const chunks = Array.from({ length: 10 }, (_, i) => mk(i, 100));
  const sel = selectPassages(chunks, new Array(10).fill(0), { budgetChars: 450 });
  assert.deepEqual(indices(sel), [0, 1, 2, 3]);
  assert.equal(sel.focusMatched, false);
  assert.equal(sel.truncated, true);
});

test("fallback prefix is capped by fallbackChars", () => {
  const chunks = Array.from({ length: 10 }, (_, i) => mk(i, 100));
  const sel = selectPassages(chunks, new Array(10).fill(0), { budgetChars: 5000, fallbackChars: 250 });
  assert.deepEqual(indices(sel), [0, 1]);
});

test("a short page is not marked truncated", () => {
  const chunks = [mk(0, 100), mk(1, 100)];
  const sel = selectPassages(chunks, [0, 0], { budgetChars: 5000 });
  assert.equal(sel.truncated, false);
});

test("drops weak matches below the relative threshold when truncated", () => {
  const chunks = [mk(0, 100), mk(1, 100), mk(2, 100), mk(3, 100), mk(4, 100)];
  const sel = selectPassages(chunks, [0, 10, 2, 0, 0], { budgetChars: 250 });
  assert.deepEqual(indices(sel), [0, 1]);
});

test("returns the entire page in order without truncation when totalChars <= budget", () => {
  const chunks = [mk(0, 100), mk(1, 100), mk(2, 100), mk(3, 100)];
  const sel = selectPassages(chunks, [0, 10, 2, 0], { budgetChars: 5000 });
  assert.deepEqual(indices(sel), [0, 1, 2, 3]);
  assert.equal(sel.truncated, false);
});

test("expands context to adjacent chunks when remaining budget allows", () => {
  const chunks = Array.from({ length: 6 }, (_, i) => mk(i, 100));
  const scores = [0, 0, 0, 10, 0, 0];
  const sel = selectPassages(chunks, scores, { budgetChars: 400 });
  // Capped at 1 neighbor per hit: lead (0), hit (3), next neighbor (4)
  assert.deepEqual(indices(sel), [0, 3, 4]);
});

test("Case 18 regression: adjacent expansion rescues suppressed mechanism chunk within same section without crossing section boundary", () => {
  // s0: intro
  // s1: problem chapter with query term repetition (score 11.6)
  // s2: solution chapter with mechanism chunk (score 1.26) and conclusion chunk (score 6.9)
  // s3: unrelated chapter (score 0)
  const chunks = [
    mk(0, 100, "s0"), // intro
    mk(1, 100, "s1"), // problem chapter
    mk(2, 100, "s2"), // solution mechanism
    mk(3, 100, "s2"), // solution conclusion
    mk(4, 100, "s3"), // unrelated next chapter
  ];
  const scores = [0, 11.6, 1.26, 6.9, 0];
  // Budget allows 400 chars (4 chunks). Threshold is 11.6 * 0.3 = 3.48
  // Chunk 2 (score 1.26) is below threshold, but adjacent to Chunk 3 in same section s2
  // Chunk 4 is adjacent to Chunk 3 but in section s3 (must NOT be pulled in)
  const sel = selectPassages(chunks, scores, { budgetChars: 400 });
  assert.deepEqual(indices(sel), [0, 1, 2, 3]);
  assert.equal(sel.passages.some((p) => p.chunk.index === 4), false);
});

test("skips a chunk that does not fit but still adds a smaller later one", () => {
  const chunks = [mk(0, 100), mk(1, 500), mk(2, 50)];
  const sel = selectPassages(chunks, [0, 9, 8], { budgetChars: 300 });
  assert.deepEqual(indices(sel), [0, 2]);
});

test("equal scores resolve by document position", () => {
  const chunks = [mk(0, 100), mk(1, 100), mk(2, 100), mk(3, 100)];
  const sel = selectPassages(chunks, [0, 4, 4, 4], { budgetChars: 250, includeLead: false });
  assert.deepEqual(indices(sel), [1, 2]);
});

test("an oversized best chunk is clipped to the budget instead of returning nothing", () => {
  const sel = selectPassages([mk(0, 800)], [0], { budgetChars: 500 });
  assert.equal(sel.passages.length, 1);
  assert.ok(cpLength(sel.passages[0].chunk.text) <= 500);
  assert.ok(sel.passages[0].chunk.text.endsWith("…"));
  assert.ok(sel.returnedChars <= 500);

  const matched = selectPassages([mk(0, 800), mk(1, 800)], [0, 7], { budgetChars: 500 });
  assert.deepEqual(indices(matched), [1]);
  assert.ok(matched.returnedChars <= 500);
});

test("empty input or zero budget returns nothing", () => {
  assert.equal(selectPassages([], [], { budgetChars: 500 }).passages.length, 0);
  assert.equal(selectPassages([mk(0, 10)], [1], { budgetChars: 0 }).passages.length, 0);
});
