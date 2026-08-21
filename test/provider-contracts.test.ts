/**
 * dsh-web-tools — provider-native option contracts unit tests.
 *
 * Verifies that the UI option values match the Host's sanitizer accept list
 * and the API documentation. These tests are pure JS (no DOM, no React).
 * @module
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRAVE_THRESHOLD_OPTIONS,
  BRAVE_TOKEN_BUDGET_PRESETS,
  PARALLEL_PRIMARY_MODES,
  PARALLEL_EXPERIMENTAL_MODES,
  PARALLEL_ALL_MODES,
  tavilyChunksVisible,
  EXA_SEARCH_TYPE_OPTIONS,
  exaPrimaryMode,
  exaPrimaryApplyable,
} from "../src/client/provider-preferences/contracts.ts";

// ------ Brave content threshold ------
test("Brave: uses disabled not off for the off/threshold value", () => {
  assert.ok(BRAVE_THRESHOLD_OPTIONS.includes("disabled"));
  assert.ok(!BRAVE_THRESHOLD_OPTIONS.includes("off"));
});

test("Brave: accepts the full Brave API enum", () => {
  assert.deepStrictEqual([...BRAVE_THRESHOLD_OPTIONS], ["strict", "balanced", "lenient", "disabled"]);
});

test("Brave: token budget presets include 32K (32768)", () => {
  assert.ok(BRAVE_TOKEN_BUDGET_PRESETS.includes(32768));
  assert.ok(BRAVE_TOKEN_BUDGET_PRESETS.includes(16384));
  assert.ok(BRAVE_TOKEN_BUDGET_PRESETS.includes(8192));
  assert.ok(BRAVE_TOKEN_BUDGET_PRESETS.includes(4096));
});

test("Brave: max token budget matches the API max of 32768", () => {
  assert.strictEqual(Math.max(...BRAVE_TOKEN_BUDGET_PRESETS), 32768);
});

// ------ Parallel mode contracts ------
test("Parallel: primary UI modes are advanced and basic only", () => {
  assert.deepStrictEqual([...PARALLEL_PRIMARY_MODES], ["advanced", "basic"]);
});

test("Parallel: experimental modes are fast and turbo", () => {
  assert.deepStrictEqual([...PARALLEL_EXPERIMENTAL_MODES], ["fast", "turbo"]);
});

test("Parallel: all modes combined match the adapter's full set", () => {
  assert.deepStrictEqual([...PARALLEL_ALL_MODES], ["advanced", "basic", "fast", "turbo"]);
});

// ------ Tavily chunks gating ------
test("Tavily: chunks visible only when depth is advanced AND autoParams is false", () => {
  assert.strictEqual(tavilyChunksVisible("advanced", false), true);
  assert.strictEqual(tavilyChunksVisible("advanced", true), false);
  assert.strictEqual(tavilyChunksVisible("basic", false), false);
  assert.strictEqual(tavilyChunksVisible("basic", true), false);
  assert.strictEqual(tavilyChunksVisible("fast", false), false);
  assert.strictEqual(tavilyChunksVisible("ultra-fast", false), false);
});

// ------ Exa search type contracts ------
test("Exa: search type options match the official API", () => {
  assert.deepStrictEqual([...EXA_SEARCH_TYPE_OPTIONS], ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"]);
});

test("Exa: primary mode mapping collapses instant into fast and deep variants into deep", () => {
  assert.strictEqual(exaPrimaryMode("auto"), "auto");
  assert.strictEqual(exaPrimaryMode("fast"), "fast");
  assert.strictEqual(exaPrimaryMode("instant"), "fast");
  assert.strictEqual(exaPrimaryMode("deep-lite"), "deep");
  assert.strictEqual(exaPrimaryMode("deep"), "deep");
  assert.strictEqual(exaPrimaryMode("deep-reasoning"), "deep");
});

test("Exa: lossless guard prevents deep from overwriting precise deep variants", () => {
  // Safe: "deep" clicked while current is auto → allowed
  assert.strictEqual(exaPrimaryApplyable("deep", "auto"), true);
  // Safe: "fast" clicked while current is deep-reasoning → allowed (user explicitly switches)
  assert.strictEqual(exaPrimaryApplyable("fast", "deep-reasoning"), true);
  // Blocked: "deep" clicked while current is deep-reasoning → lossless, blocked
  assert.strictEqual(exaPrimaryApplyable("deep", "deep-reasoning"), false);
  // Blocked: "deep" clicked while current is deep-lite → blocked
  assert.strictEqual(exaPrimaryApplyable("deep", "deep-lite"), false);
  // Safe: "deep" clicked while current is deep → blocked (no-op, but harmless)
  assert.strictEqual(exaPrimaryApplyable("deep", "deep"), false);
});