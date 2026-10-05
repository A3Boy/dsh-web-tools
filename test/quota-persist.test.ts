/**
 * dsh-web-tools — coalesced quota persistence tests.
 *
 * Brave changes its quota snapshot on nearly every search, and on DSH 0.1.7 a
 * settings write costs seconds (profile patch + Loader reconciliation under
 * hmr.runExclusive). Persisting per search for a display-only value would run
 * that path continuously and contend with the user's own edits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createQuotaPersistScheduler,
  quotaSnapshotChanged,
} from "../src/host/quota-persist.ts";
import type { QuotaSnapshot } from "../src/host/quota.ts";

function snapshot(remaining: number): QuotaSnapshot {
  return {
    supported: true,
    authoritative: true,
    unit: "requests",
    source: "header",
    fetchedAt: 1_700_000_000_000,
    remaining,
    limit: 20000,
  } as QuotaSnapshot;
}

test("quotaSnapshotChanged compares by value, not identity", () => {
  assert.equal(quotaSnapshotChanged(snapshot(10), snapshot(10)), false);
  assert.equal(quotaSnapshotChanged(snapshot(10), snapshot(11)), true);
  assert.equal(quotaSnapshotChanged(undefined, snapshot(10)), true);
  assert.equal(quotaSnapshotChanged(snapshot(10), undefined), true);
});

test("coalesces many search-driven records into one write per window", () => {
  const writes: Array<Record<string, QuotaSnapshot>> = [];
  const scheduler = createQuotaPersistScheduler((cache) => writes.push(cache), {
    delayMs: 60_000,
  });

  // Ten searches, each reporting a slightly different remaining balance.
  for (let i = 1; i <= 10; i += 1) scheduler.record("brave-key-1", snapshot(100 - i));

  assert.equal(writes.length, 0, "nothing is written until the window elapses");
  assert.deepEqual(scheduler.pendingKeys(), ["brave-key-1"]);

  scheduler.flushNow();
  assert.equal(writes.length, 1, "ten searches collapse into a single write");
  assert.equal((writes[0]["brave-key-1"] as QuotaSnapshot).remaining, 90);
});

test("an unchanged snapshot never schedules a write", () => {
  const writes: Array<Record<string, QuotaSnapshot>> = [];
  const scheduler = createQuotaPersistScheduler((cache) => writes.push(cache), {
    delayMs: 60_000,
  });

  scheduler.record("k", snapshot(50));
  scheduler.flushNow();
  assert.equal(writes.length, 1);

  // The same balance reported again by the next search must not write.
  scheduler.record("k", snapshot(50));
  assert.deepEqual(scheduler.pendingKeys(), []);
  scheduler.flushNow();
  assert.equal(writes.length, 1, "no redundant write for an identical snapshot");
});

test("seed preserves unrelated keys loaded from settings", () => {
  const writes: Array<Record<string, QuotaSnapshot>> = [];
  const scheduler = createQuotaPersistScheduler((cache) => writes.push(cache), {
    delayMs: 60_000,
  });

  scheduler.seed({ "other-key": snapshot(7) });
  scheduler.record("brave-key-1", snapshot(3));
  scheduler.flushNow();

  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]).sort(), ["brave-key-1", "other-key"]);
  assert.equal((writes[0]["other-key"] as QuotaSnapshot).remaining, 7, "seeded key survives");
});

test("dispose flushes pending state so teardown loses nothing", () => {
  const writes: Array<Record<string, QuotaSnapshot>> = [];
  const scheduler = createQuotaPersistScheduler((cache) => writes.push(cache), {
    delayMs: 60_000,
  });

  scheduler.record("k", snapshot(1));
  assert.equal(writes.length, 0);
  scheduler.dispose();
  assert.equal(writes.length, 1, "teardown persists the last known balance");
});

test("the quiet window elapses and flushes once, without a manual flush", async () => {
  const writes: Array<Record<string, QuotaSnapshot>> = [];
  const scheduler = createQuotaPersistScheduler((cache) => writes.push(cache), {
    delayMs: 20,
  });

  scheduler.record("k", snapshot(1));
  scheduler.record("k", snapshot(2));
  assert.equal(writes.length, 0, "still inside the quiet window");

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(writes.length, 1, "the window elapses and writes exactly once");
  assert.equal((writes[0].k as QuotaSnapshot).remaining, 2, "the newest snapshot wins");
});

test("empty api key is ignored", () => {
  const writes: Array<Record<string, QuotaSnapshot>> = [];
  const scheduler = createQuotaPersistScheduler((cache) => writes.push(cache), {
    delayMs: 60_000,
  });
  scheduler.record("", snapshot(1));
  scheduler.flushNow();
  assert.equal(writes.length, 0);
});
