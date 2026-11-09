import test from "node:test";
import assert from "node:assert/strict";
import {
  parseKeenableUsage,
  recordKeenableUsage,
  recordKeenableUsageFromBody,
  keenableUsageOf,
  keenableLocalQuota,
  seedKeenableUsageCache,
  resetKeenableUsageCache,
  monthKeyOf,
} from "../src/host/providers/keenable-usage.ts";
import {
  mapKeenableBalance,
  nextMonthlyReset,
  balanceSnapshot,
  fetchKeenableBalance,
  resetKeenableBffSession,
} from "../src/host/providers/keenable-bff.ts";
import { mergePoolQuota } from "../src/host/quota.ts";

test.beforeEach(() => {
  resetKeenableUsageCache();
  resetKeenableBffSession();
  delete process.env.KEENABLE_SESSION_TOKEN;
  delete process.env.KEENABLE_REFRESH_TOKEN;
});

test("parseKeenableUsage reads the documented usage object", () => {
  assert.deepEqual(
    parseKeenableUsage({ usage: { sku: "search.pro", amount: 1, credits: 1, paid: true } }),
    { credits: 1, paid: true, sku: "search.pro", amount: 1 },
  );
  // paid defaults to false, unknown fields are ignored
  assert.deepEqual(parseKeenableUsage({ usage: { credits: 2 } }), { credits: 2, paid: false });
});

test("parseKeenableUsage ignores bodies without a charge", () => {
  assert.equal(parseKeenableUsage(null), null);
  assert.equal(parseKeenableUsage({}), null);
  assert.equal(parseKeenableUsage({ usage: null }), null);
  assert.equal(parseKeenableUsage({ usage: { credits: "1" } }), null);
  assert.equal(parseKeenableUsage({ usage: { credits: -1 } }), null);
  assert.equal(parseKeenableUsage({ usage: { credits: Number.NaN } }), null);
});

test("the ledger accumulates credits, calls, paid credits and the last SKU", () => {
  const now = Date.UTC(2026, 10, 9, 8, 0, 0);
  recordKeenableUsage("key-a", { credits: 1, paid: false, sku: "search.pro" }, now);
  recordKeenableUsage("key-a", { credits: 0.5, paid: true, sku: "fetch.live" }, now + 1000);
  const bucket = keenableUsageOf("key-a", now + 2000);
  assert.ok(bucket);
  assert.equal(bucket.month, "2026-11");
  assert.equal(bucket.credits, 1.5);
  assert.equal(bucket.paidCredits, 0.5);
  assert.equal(bucket.calls, 2);
  assert.equal(bucket.lastSku, "fetch.live");

  // Another key has its own ledger.
  assert.equal(keenableUsageOf("key-b", now), undefined);
  // An empty key is never recorded.
  assert.equal(recordKeenableUsage("  ", { credits: 1, paid: false }, now), undefined);
});

test("the ledger rolls over when the UTC month changes", () => {
  const november = Date.UTC(2026, 10, 30, 23, 0, 0);
  recordKeenableUsage("key-a", { credits: 3, paid: false }, november);
  assert.equal(keenableUsageOf("key-a", november)?.credits, 3);
  const december = Date.UTC(2026, 11, 1, 1, 0, 0);
  assert.equal(keenableUsageOf("key-a", december), undefined);
  recordKeenableUsage("key-a", { credits: 1, paid: false }, december);
  const bucket = keenableUsageOf("key-a", december);
  assert.equal(bucket?.month, "2026-12");
  assert.equal(bucket?.credits, 1);
  assert.equal(bucket?.calls, 1);
});

test("recordKeenableUsageFromBody skips bodies without usage", () => {
  const now = Date.UTC(2026, 10, 9);
  assert.equal(recordKeenableUsageFromBody("key-a", { results: [] }, now), undefined);
  assert.equal(keenableUsageOf("key-a", now), undefined);
});

test("keenableLocalQuota is display-only: used credits, no invented balance", () => {
  const now = Date.UTC(2026, 10, 9);
  assert.equal(keenableLocalQuota("key-a", now), undefined);
  recordKeenableUsage("key-a", { credits: 4, paid: true, sku: "search.realtime" }, now);
  const q = keenableLocalQuota("key-a", now);
  assert.ok(q);
  assert.equal(q.supported, true);
  assert.equal(q.authoritative, false);
  assert.equal(q.unit, "credits");
  assert.equal(q.used, 4);
  assert.equal(q.remaining, undefined);
  assert.equal(q.source, "local_estimate");
  assert.equal(q.breakdown?.calls, 1);
  assert.equal(q.breakdown?.paid_credits, 4);
});

test("seedKeenableUsageCache restores a persisted ledger and drops junk", () => {
  const now = Date.UTC(2026, 10, 9);
  seedKeenableUsageCache({
    good: { month: monthKeyOf(now), credits: 7, paidCredits: 0, calls: 3, lastSku: "fetch" },
    bad: { month: "nonsense", credits: 1, paidCredits: 0, calls: 1 },
  } as any);
  const bucket = keenableUsageOf("good", now);
  assert.equal(bucket?.credits, 7);
  assert.equal(bucket?.calls, 3);
  assert.equal(keenableUsageOf("bad", now), undefined);
});

test("mapKeenableBalance normalizes the console balance document", () => {
  const view = mapKeenableBalance({
    free_credits: 100000,
    search_spendings: 1200,
    fetch_spendings: 300,
    workflow_spendings: 0,
    paid_credits: 50,
    activation_date: "2026-10-15T10:00:00Z",
  });
  assert.ok(view);
  assert.equal(view.totalCredits, 100000);
  assert.equal(view.spentCredits, 1500);
  assert.equal(view.remainingCredits, 98500);
  assert.equal(view.paidCredits, 50);
  assert.deepEqual(view.breakdown, { search: 1200, fetch: 300, workflow: 0, paid_credits: 50 });
  assert.ok(view.resetAt);
});

test("mapKeenableBalance prefers charged_spendings and accepts camelCase", () => {
  const view = mapKeenableBalance({
    freeCredits: 500,
    chargedSpendings: 320,
    searchSpendings: 300,
    fetchSpendings: 20,
    paidCredits: 0,
    activationDate: "2026-10-31T00:00:00Z",
  });
  assert.ok(view);
  assert.equal(view.totalCredits, 500);
  assert.equal(view.spentCredits, 320);
  assert.equal(view.remainingCredits, 180);
  assert.deepEqual(view.breakdown, { search: 300, fetch: 20 });
});

test("mapKeenableBalance never invents a balance from an unknown document", () => {
  assert.equal(mapKeenableBalance(null), null);
  assert.equal(mapKeenableBalance({}), null);
  assert.equal(mapKeenableBalance({ credits: 10, remaining: 5 }), null);
});

test("nextMonthlyReset lands on the activation day in UTC", () => {
  const reset = nextMonthlyReset("2026-01-31T00:00:00Z", Date.UTC(2026, 1, 5));
  assert.equal(reset, "2026-02-28T00:00:00.000Z");
  const sameMonth = nextMonthlyReset("2026-01-10T00:00:00Z", Date.UTC(2026, 1, 5));
  assert.equal(sameMonth, "2026-02-10T00:00:00.000Z");
  assert.equal(nextMonthlyReset("not a date", Date.now()), undefined);
});

test("balanceSnapshot is authoritative and carries the full shape", () => {
  const view = mapKeenableBalance({
    free_credits: 100,
    search_spendings: 40,
    fetch_spendings: 10,
    activation_date: "2026-10-15T10:00:00Z",
  });
  assert.ok(view);
  const snapshot = balanceSnapshot(view, "group-a");
  assert.equal(snapshot.authoritative, true);
  assert.equal(snapshot.source, "api");
  assert.equal(snapshot.unit, "credits");
  assert.equal(snapshot.remaining, 50);
  assert.equal(snapshot.used, 50);
  assert.equal(snapshot.limit, 100);
  assert.equal(snapshot.group, "group-a");
});

test("mergePoolQuota counts a shared organization balance once", () => {
  const perKey = balanceSnapshot(
    mapKeenableBalance({ free_credits: 1000, search_spendings: 100 })!,
    "keenable-session:user-1",
  );
  const merged = mergePoolQuota([perKey, { ...perKey }]);
  assert.equal(merged.limit, 1000);
  assert.equal(merged.remaining, 900);
  assert.equal(merged.used, 100);
});

test("mergePoolQuota still sums unrelated keys", () => {
  const a = balanceSnapshot(mapKeenableBalance({ free_credits: 1000, search_spendings: 100 })!, "group-a");
  const b = balanceSnapshot(mapKeenableBalance({ free_credits: 1000, search_spendings: 100 })!, "group-b");
  const merged = mergePoolQuota([a, b]);
  assert.equal(merged.limit, 2000);
  assert.equal(merged.remaining, 1800);
});

test("fetchKeenableBalance is a no-op without a session", async () => {
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("must not be called");
  }) as unknown as typeof globalThis.fetch;
  try {
    assert.equal(await fetchKeenableBalance(), null);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchKeenableBalance reads the BFF balance with the session token", async () => {
  process.env.KEENABLE_SESSION_TOKEN = "session-token-abc";
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return {
      status: 200,
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ free_credits: 1000, search_spendings: 400, fetch_spendings: 100 }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;
  try {
    const snapshot = await fetchKeenableBalance();
    assert.ok(snapshot);
    assert.equal(capturedUrl, "https://api.keenable.ai/bff/organization/balance");
    assert.equal(capturedHeaders.authorization, "Bearer session-token-abc");
    assert.equal(snapshot.remaining, 500);
    assert.equal(snapshot.authoritative, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchKeenableBalance returns null on 401 or an unrecognized document", async () => {
  process.env.KEENABLE_SESSION_TOKEN = "session-token-abc";
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => ({ status: 401, ok: false, headers: { get: () => null } })) as unknown as typeof globalThis.fetch;
    assert.equal(await fetchKeenableBalance(), null);

    resetKeenableBffSession();
    globalThis.fetch = (async () => ({
      status: 200,
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ unexpected: true }),
    })) as unknown as typeof globalThis.fetch;
    assert.equal(await fetchKeenableBalance(), null);
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchKeenableBalance memoizes the organization balance across keys", async () => {
  process.env.KEENABLE_SESSION_TOKEN = "session-token-abc";
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return {
      status: 200,
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ free_credits: 1000, search_spendings: 100 }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;
  try {
    const first = await fetchKeenableBalance();
    const second = await fetchKeenableBalance();
    assert.equal(calls, 1);
    assert.equal(first?.remaining, 900);
    assert.equal(second?.remaining, 900);
  } finally {
    globalThis.fetch = original;
    resetKeenableBffSession();
  }
});
