/**
 * dsh-web-tools — SearchRoutingPolicy unit tests.
 *
 * Tests the pure routing policy helper and verifies:
 *  - ordered: keeps priority order exactly
 *  - round-robin: rotates starting provider on consecutive calls
 *  - random: selects starting offset with predictable RNG
 *  - fallback: preserves remainder of chain in order after start offset
 *  - single/empty base chains: handles edge cases gracefully
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveSearchChain, type SearchRoutingState } from "../src/host/routing-policy.ts";

test("routing-policy: ordered policy always returns base chain copy", () => {
  const base = ["exa", "brave", "tavily"];
  const chain1 = resolveSearchChain(base, "ordered");
  assert.deepEqual(chain1, ["exa", "brave", "tavily"]);
  // verify original array is not mutated
  assert.notEqual(chain1, base);
});

test("routing-policy: round-robin rotates start offset on each call and wraps around", () => {
  const base = ["exa", "brave", "tavily"];
  const state: SearchRoutingState = { nextRoundRobinIndex: 0 };

  // Call 1: offset 0 → ["exa", "brave", "tavily"]
  const r1 = resolveSearchChain(base, "round-robin", state);
  assert.deepEqual(r1, ["exa", "brave", "tavily"]);
  assert.equal(state.nextRoundRobinIndex, 1);

  // Call 2: offset 1 → ["brave", "tavily", "exa"]
  const r2 = resolveSearchChain(base, "round-robin", state);
  assert.deepEqual(r2, ["brave", "tavily", "exa"]);
  assert.equal(state.nextRoundRobinIndex, 2);

  // Call 3: offset 2 → ["tavily", "exa", "brave"]
  const r3 = resolveSearchChain(base, "round-robin", state);
  assert.deepEqual(r3, ["tavily", "exa", "brave"]);
  assert.equal(state.nextRoundRobinIndex, 0);

  // Call 4: wrap around → ["exa", "brave", "tavily"]
  const r4 = resolveSearchChain(base, "round-robin", state);
  assert.deepEqual(r4, ["exa", "brave", "tavily"]);
  assert.equal(state.nextRoundRobinIndex, 1);
});

test("routing-policy: random policy rotates based on injected RNG", () => {
  const base = ["exa", "brave", "tavily"];

  // RNG returning 0.0 -> offset 0
  const r0 = resolveSearchChain(base, "random", undefined, () => 0.0);
  assert.deepEqual(r0, ["exa", "brave", "tavily"]);

  // RNG returning 0.4 -> offset 1 (floor(0.4 * 3) = 1)
  const r1 = resolveSearchChain(base, "random", undefined, () => 0.4);
  assert.deepEqual(r1, ["brave", "tavily", "exa"]);

  // RNG returning 0.8 -> offset 2 (floor(0.8 * 3) = 2)
  const r2 = resolveSearchChain(base, "random", undefined, () => 0.8);
  assert.deepEqual(r2, ["tavily", "exa", "brave"]);
});

test("routing-policy: handles empty and single-element base chains", () => {
  assert.deepEqual(resolveSearchChain([], "ordered"), []);
  assert.deepEqual(resolveSearchChain([], "round-robin"), []);
  assert.deepEqual(resolveSearchChain([], "random"), []);

  assert.deepEqual(resolveSearchChain(["exa"], "ordered"), ["exa"]);
  assert.deepEqual(resolveSearchChain(["exa"], "round-robin"), ["exa"]);
  assert.deepEqual(resolveSearchChain(["exa"], "random"), ["exa"]);
});
