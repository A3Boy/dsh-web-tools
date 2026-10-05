/**
 * dsh-web-tools — settings-state application policy tests.
 *
 * Regression guard for the "routing edit applies server-side but the page does
 * not repaint until reopened" defect:
 *
 *  - a routing write paints the new order optimistically, because the DSH
 *    settings write (profile patch edit + recomposition) measures in seconds,
 *    so waiting for its response makes the control feel unresponsive,
 *  - the write's own response is authoritative and settles the view, and
 *  - a completed settings read must be discarded only when a NEWER read has
 *    already been applied, never merely because a newer read started.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyRoutingResult,
  createReadSequencer,
  routingFields,
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

test("routingFields projects an intent into the fields the view paints from", () => {
  const fields = routingFields(["exa", "tavily", "brave"], "ordered");
  assert.equal(fields.defaultProvider, "exa");
  assert.deepEqual(fields.fallbackOrder, ["tavily", "brave"]);
  assert.equal(fields.policy, "ordered");
  assert.equal(fields.saved, true);

  // The optimistic view can be painted before any request is in flight, so the
  // control feels instant while the (slow) write runs behind it.
  const painted = applyRoutingResult(view(), fields) as any;
  assert.equal(painted.defaultProvider, "exa");
  assert.deepEqual(painted.fallbackOrder, ["tavily", "brave"]);
});

test("routingFields drops duplicates keeping first occurrence", () => {
  const fields = routingFields(["a", "b", "a", "c", "b"], "random");
  assert.equal(fields.defaultProvider, "a");
  assert.deepEqual(fields.fallbackOrder, ["b", "c"]);
  assert.equal(fields.policy, "random");
});

test("routingFields round-trips the order it is given (no reordering)", () => {
  const ordered = ["parallel", "exa", "searxng"];
  const fields = routingFields(ordered, "ordered");
  assert.deepEqual([fields.defaultProvider, ...fields.fallbackOrder], ordered);
});

test("an un-confirmed intent survives a read that lands inside the write window", () => {
  // The write takes seconds. Sequence: user adds "brave" (optimistic), then a
  // config read returns the STILL-OLD persisted order. Without re-applying the
  // pending intent the row would visibly snap back, which reads as "the click
  // did not work".
  const intent = routingFields(["exa", "tavily", "parallel", "brave"], "ordered");

  const optimistic = applyRoutingResult(view(), intent) as any;
  assert.deepEqual(optimistic.fallbackOrder, ["tavily", "parallel", "brave"]);

  const staleRead = view(); // Host has not committed yet
  assert.deepEqual((staleRead as any).fallbackOrder, ["tavily", "parallel"]);

  const merged = applyRoutingResult(staleRead, intent) as any;
  assert.deepEqual(
    merged.fallbackOrder,
    ["tavily", "parallel", "brave"],
    "the pending intent must stay on top of a stale read",
  );

  // Once the write confirms, the same merge is a no-op rather than a revert.
  const confirmed = applyRoutingResult(
    view({ fallbackOrder: ["tavily", "parallel", "brave"] }),
    intent,
  ) as any;
  assert.deepEqual(confirmed.fallbackOrder, ["tavily", "parallel", "brave"]);
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
