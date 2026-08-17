/**
 * dsh-web-tools — Search Mode runtime state model tests (pure, no DSH/pnpm).
 *
 * Covers the behavior table demanded by the "联网搜索" feature: auto leaves the
 * turn free, required freezes the flag per turn, a completed web_search (even
 * a failed one) satisfies the requirement, mid-turn flips only affect the next
 * turn, and sessions never pollute each other.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SearchModeRuntime } from "../src/host/search-mode-runtime.ts";

function runtime(available = true): SearchModeRuntime {
  return new SearchModeRuntime(() => available);
}

test("default mode is auto and does not mark a turn required", () => {
  const r = runtime();
  assert.equal(r.getMode("s1"), "auto");
  const turn = r.beginTurn("s1", 1);
  assert.equal(turn.required, false);
  assert.equal(turn.webSearchCompleted, false);
});

test("setMode(required) freezes the flag for the CURRENT turn only", () => {
  const r = runtime();
  r.setMode("s1", "required");
  const t17 = r.beginTurn("s1", 17);
  assert.equal(t17.required, true);
  // Mid-turn flip to auto does NOT change the already-begun turn (no race).
  r.setMode("s1", "auto");
  const same17 = r.beginTurn("s1", 17);
  assert.equal(same17.required, true, "frozen for the in-flight turn");
  // A NEW turn reads the updated mode.
  const t18 = r.beginTurn("s1", 18);
  assert.equal(t18.required, false);
});

test("markSearchResult: a completed search (even failure) satisfies the requirement", () => {
  const r = runtime();
  r.setMode("s1", "required");
  r.beginTurn("s1", 5);
  assert.equal(r.getTurn("s1")?.webSearchCompleted, false);
  // All-provider failure is still "tried".
  r.markSearchResult("s1", false);
  const state = r.getTurn("s1");
  assert.equal(state?.webSearchCompleted, true, "failure still counts as completed");
  assert.equal(state?.webSearchSucceeded, false);
});

test("markSearchResult success records succeeded", () => {
  const r = runtime();
  r.setMode("s1", "required");
  r.beginTurn("s1", 1);
  r.markSearchResult("s1", true);
  assert.equal(r.getTurn("s1")?.webSearchCompleted, true);
  assert.equal(r.getTurn("s1")?.webSearchSucceeded, true);
});

test("correction counter increments on steer (no infinite loop), then cancel path", () => {
  const r = runtime();
  r.setMode("s1", "required");
  const state = r.beginTurn("s1", 3);
  assert.equal(state.correctionCount, 0);
  state.correctionCount += 1; // first steer
  assert.equal(state.correctionCount, 1);
  state.correctionCount += 1; // second offense → runtime.cancel is called upstream
  assert.equal(state.correctionCount, 2);
});

test("sessions never pollute each other", () => {
  const r = runtime();
  r.setMode("A", "required");
  assert.equal(r.getMode("B"), "auto");
  r.beginTurn("A", 1);
  r.markSearchResult("A", true);
  assert.equal(r.getTurn("B"), undefined);
  assert.equal(r.getMode("A"), "required");
});

test("required persists across turns in the same session", () => {
  const r = runtime();
  r.setMode("s1", "required");
  assert.equal(r.beginTurn("s1", 1).required, true);
  assert.equal(r.beginTurn("s1", 2).required, true);
});

test("setMode(auto) clears the entry back to auto", () => {
  const r = runtime();
  r.setMode("s1", "required");
  r.setMode("s1", "auto");
  assert.equal(r.getMode("s1"), "auto");
  assert.equal(r.beginTurn("s1", 1).required, false);
});

test("clear drops mode and turn state (agent disposed)", () => {
  const r = runtime();
  r.setMode("s1", "required");
  r.beginTurn("s1", 1);
  r.clear("s1");
  assert.equal(r.getMode("s1"), "auto");
  assert.equal(r.getTurn("s1"), undefined);
});

test("view reports mode and availability", () => {
  const r = runtime(false);
  r.setMode("s1", "required");
  assert.deepEqual(r.view("s1"), { mode: "required", available: false });
  const r2 = runtime(true);
  r2.setMode("s1", "required");
  assert.deepEqual(r2.view("s1"), { mode: "required", available: true });
});
