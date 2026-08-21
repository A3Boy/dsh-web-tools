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