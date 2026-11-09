import test from "node:test";
import assert from "node:assert/strict";
import { createSearchProvider, createFetchProvider, type ProviderAdapterLike, type WebToolsRuntimeConfig } from "../src/host/registry.ts";
import {
  createProviderHealthStore,
  breakerCooldownMs,
  BREAKER_PROBE_STALE_MS,
} from "../src/host/provider-health.ts";

function setup() {
  let t = 1_000_000;
  const health = createProviderHealthStore({ now: () => t });
  return { health, advance: (ms: number) => { t += ms; } };
}

function failTimes(health: ReturnType<typeof createProviderHealthStore>, provider: string, n: number, code = "timeout") {
  for (let i = 0; i < n; i++) health.recordFailure(provider, code);
}

for (const mode of ["search", "fetch"] as const) {
  test(`breaker integration: ${mode} skips failures, admits one probe, then recovers`, async () => {
    const { health, advance } = setup();
    let calls = 0;
    let failing = true;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const run = async () => {
      calls += 1;
      if (failing) throw Object.assign(new Error("upstream down"), { code: "server" });
      await gate;
    };
    const adapters: Record<string, ProviderAdapterLike> = { exa: {
      name: "exa", needsBaseUrl: false, fetchCapable: true,
      async search() { await run(); return { sources: [{ url: "https://a.test" }] }; },
      async fetch() { await run(); return { text: "body" }; },
    } };
    const cfg: WebToolsRuntimeConfig = { enabled: true, defaultProvider: "exa", fallbackOrder: ["exa"],
      providerAttemptTimeoutMs: 5000, providerBaseUrls: {}, enabledProviders: { exa: true } };
    const search = createSearchProvider(() => cfg, async () => "key", { record() {} }, adapters, undefined, health);
    const fetch = createFetchProvider(() => cfg, async () => "key", adapters, undefined, health,
      async () => { throw new Error("generic unavailable in test"); });
    const request = () => mode === "search" ? search.search({ query: "q" }) : fetch.fetch({ url: "https://a.test" });
    for (let i = 0; i < 4; i++) await assert.rejects(request());
    assert.equal(calls, 3);
    advance(30_000);
    failing = false;
    const probe = request();
    await new Promise((r) => setImmediate(r));
    await assert.rejects(request());
    assert.equal(calls, 4);
    release();
    await probe;
    await request();
    assert.equal(calls, 5);
    assert.deepEqual(health.breakerSnapshot(), {});
  });
}

test("breaker: late success cannot close an open breaker", () => {
  const { health } = setup();
  const old = health.admit("exa");
  failTimes(health, "exa", 3);
  health.recordSuccess("exa", old);
  assert.equal(health.isCoolingDown("exa"), true);
});

test("breaker: stale probe completion cannot release or close its replacement", () => {
  const { health, advance } = setup();
  failTimes(health, "exa", 3);
  advance(30_000);
  const old = health.admit("exa");
  advance(BREAKER_PROBE_STALE_MS);
  health.admit("exa");
  health.releaseProbe("exa", old);
  health.recordSuccess("exa", old);
  assert.equal(health.breakerSnapshot().exa?.state, "half-open");
  assert.equal(health.admit("exa").state, "blocked");
});

test("breaker: cooldown grows 30s, 60s, 120s ... capped at 5min", () => {
  assert.equal(breakerCooldownMs(1), 30_000);
  assert.equal(breakerCooldownMs(2), 60_000);
  assert.equal(breakerCooldownMs(3), 120_000);
  assert.equal(breakerCooldownMs(4), 240_000);
  assert.equal(breakerCooldownMs(5), 300_000);
  assert.equal(breakerCooldownMs(20), 300_000);
});

test("breaker: only timeout / server / network count; auth, bad-request, config, aborted do not", () => {
  const { health } = setup();
  for (const code of ["auth", "bad-request", "config", "aborted", "rate-limit", "invalid-response"]) {
    failTimes(health, "exa", 10, code);
  }
  assert.equal(health.admit("exa").state, "allow");
  assert.deepEqual(health.breakerSnapshot(), {});
});

test("breaker: three consecutive transient failures open it; two do not", () => {
  const { health } = setup();
  failTimes(health, "exa", 2, "server");
  assert.equal(health.admit("exa").state, "allow");
  health.recordFailure("exa", "network");
  assert.equal(health.admit("exa").state, "blocked");
  assert.equal(health.isCoolingDown("exa"), true);
  assert.equal(health.breakerSnapshot().exa.state, "open");
});

test("breaker: a success resets the failure streak", () => {
  const { health } = setup();
  failTimes(health, "exa", 2);
  health.recordSuccess("exa");
  failTimes(health, "exa", 2);
  assert.equal(health.admit("exa").state, "allow");
  health.recordFailure("exa", "timeout");
  assert.equal(health.admit("exa").state, "blocked");
});

test("breaker: after the cooldown exactly one probe is admitted; success closes it", () => {
  const { health, advance } = setup();
  failTimes(health, "exa", 3);
  advance(29_999);
  assert.equal(health.admit("exa").state, "blocked");
  advance(1);
  assert.equal(health.admit("exa").state, "probe");
  assert.equal(health.admit("exa").state, "blocked", "a second caller must not pile onto the probe");
  health.recordSuccess("exa");
  assert.equal(health.admit("exa").state, "allow");
  assert.deepEqual(health.breakerSnapshot(), {});
});

test("breaker: a failed probe re-opens with a doubled cooldown", () => {
  const { health, advance } = setup();
  failTimes(health, "exa", 3);
  advance(30_000);
  assert.equal(health.admit("exa").state, "probe");
  health.recordFailure("exa", "timeout");
  advance(59_999);
  assert.equal(health.admit("exa").state, "blocked");
  advance(1);
  assert.equal(health.admit("exa").state, "probe");
  assert.equal(health.breakerSnapshot().exa.trips, 2);
});

test("breaker: a probe given back without a verdict lets the next caller probe", () => {
  const { health, advance } = setup();
  failTimes(health, "exa", 3);
  advance(30_000);
  assert.equal(health.admit("exa").state, "probe");
  health.releaseProbe("exa");
  assert.equal(health.admit("exa").state, "probe");
});

test("breaker: a probe that never reports is treated as lost after the stale window", () => {
  const { health, advance } = setup();
  failTimes(health, "exa", 3);
  advance(30_000);
  assert.equal(health.admit("exa").state, "probe");
  advance(BREAKER_PROBE_STALE_MS - 1);
  assert.equal(health.admit("exa").state, "blocked");
  advance(1);
  assert.equal(health.admit("exa").state, "probe");
});

test("breaker: a late failure from a call started before the trip does not extend the cooldown", () => {
  const { health, advance } = setup();
  failTimes(health, "exa", 3);
  advance(10_000);
  health.recordFailure("exa", "timeout");
  advance(20_000);
  assert.equal(health.admit("exa").state, "probe");
  assert.equal(health.breakerSnapshot().exa.trips, 1);
});

test("breaker: Retry-After cooldown still blocks admit and keeps its own semantics", () => {
  const { health, advance } = setup();
  health.cooldownFor("tavily", 5_000, "rate-limit");
  assert.equal(health.admit("tavily").state, "blocked");
  assert.equal(health.isCoolingDown("tavily"), true);
  advance(5_000);
  assert.equal(health.admit("tavily").state, "allow");
  assert.equal(health.isCoolingDown("tavily"), false);
});

test("breaker: state is per provider; deleteCooldown clears breaker and cooldown of one provider only", () => {
  const { health } = setup();
  failTimes(health, "exa", 3);
  failTimes(health, "tavily", 3);
  health.setCooldown("exa", 9_999_999, "rate-limit");
  health.deleteCooldown("exa");
  assert.equal(health.admit("exa").state, "allow");
  assert.equal(health.admit("tavily").state, "blocked");
  health.clear();
  assert.equal(health.admit("tavily").state, "allow");
});

test("breaker: breakerOpenUntil reports when the next probe may run", () => {
  const { health } = setup();
  assert.equal(health.breakerOpenUntil("exa"), undefined);
  failTimes(health, "exa", 3);
  assert.equal(health.breakerOpenUntil("exa"), 1_000_000 + 30_000);
});
