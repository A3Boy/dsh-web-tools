/**
 * dsh-web-tools — settings-state application policy tests.
 *
 * Regression guard for the "routing edit applies server-side but the page does
 * not repaint until reopened" defect:
 *
 *  - a routing write's own response is authoritative and must paint the new
 *    order immediately (no read-back race), and
 *  - a completed settings read must be discarded only when a NEWER read has
 *    already been applied, never merely because a newer read started.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyRoutingResult,
  createReadSequencer,
  shouldApplyRead,
} from "../src/client/routing-state.ts";

/** A minimal ConfigView-shaped record. */
function view(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    defaultProvider: "exa",
    providerAttemptTimeoutMs: 10000,
    fallbackOrder: ["tavily", "parallel"],
    providers: [],
    platformEnabled: {},
    searchRoutingPolicy: "ordered",
    ...overrides,
  } as never;
}

test("applyRoutingResult paints the write response's order without a read-back", () => {
  const next = applyRoutingResult(view(), {
    saved: true,
    policy: "ordered",
    defaultProvider: "exa",
    fallbackOrder: ["tavily", "parallel", "brave"],
  });

  assert.ok(next);
  assert.deepEqual((next as any).fallbackOrder, ["tavily", "parallel", "brave"]);
  assert.equal((next as any).defaultProvider, "exa");
  assert.equal((next as any).searchRoutingPolicy, "ordered");
});

test("applyRoutingResult keeps unrelated fields and tolerates a null view", () => {
  const next = applyRoutingResult(view({ enabled: false }), {
    saved: true,
    policy: "random",
    defaultProvider: "brave",
    fallbackOrder: ["tavily"],
  }) as any;

  assert.equal(next.enabled, false, "unrelated config must be preserved");
  assert.equal(next.searchRoutingPolicy, "random");
  assert.equal(next.defaultProvider, "brave");

  assert.equal(applyRoutingResult(null, {
    saved: true,
    policy: "ordered",
    defaultProvider: "exa",
    fallbackOrder: [],
  }), null, "a still-loading view stays null");
});

test("shouldApplyRead drops only reads a newer read already superseded", () => {
  assert.equal(shouldApplyRead(1, 0), true, "first read applies");
  assert.equal(shouldApplyRead(1, 1), true, "the applied read is idempotent");
  assert.equal(shouldApplyRead(1, 2), false, "an older read is dropped once a newer applied");
  assert.equal(shouldApplyRead(2, 1), true, "a newer read applies");
});

test("sequencer never loses an update when a newer read merely started", () => {
  const seq = createReadSequencer();

  // The reported failure: read A starts, read B starts, B is then discarded
  // (e.g. the section unmounted), so A's result must still land.
  const a = seq.begin();
  const b = seq.begin();
  assert.equal(seq.accept(b), true, "B applies first");
  assert.equal(
    seq.accept(a),
    false,
    "A is dropped because the newer B already applied (its data is fresher)",
  );

  // The other order: B started later but never applies; A must not be lost.
  const seq2 = createReadSequencer();
  const a2 = seq2.begin();
  seq2.begin(); // newer read starts and is discarded
  assert.equal(seq2.accept(a2), true, "A must still apply when nothing newer applied");
});

test("sequencer is isolated per instance (remount gets a fresh slate)", () => {
  const first = createReadSequencer();
  const seq1 = first.begin();
  assert.equal(first.accept(seq1), true);

  const second = createReadSequencer();
  const seq2 = second.begin();
  assert.equal(second.accept(seq2), true, "a remounted instance starts clean");
});
