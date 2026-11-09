import test from "node:test";
import assert from "node:assert/strict";
import { runHedgedSearch, type LaneRole } from "../src/host/hedged-search.ts";

const source = (url: string, title: string) => ({ url, title });

test("hedged: a fast primary wins and the hedge is never started", async () => {
  const calls: string[] = [];
  const outcome = await runHedgedSearch(
    ["p1", "p2"],
    async (provider) => {
      calls.push(provider);
      return { sources: [source("https://p1.example/a", "P1")] };
    },
    { hedgeDelayMs: 200 },
  );

  assert.deepEqual(calls, ["p1"]);
  assert.equal(outcome.backend, "p1");
  assert.equal(outcome.hedgedLaunched, false);
  assert.equal(outcome.fused, false);
  assert.equal(outcome.sources.length, 1);
});

test("hedged: a slow primary triggers the second lane and the first success wins", async () => {
  const calls: string[] = [];
  let primaryAborted = false;

  const outcome = await runHedgedSearch(
    ["p1", "p2"],
    async (provider, signal: AbortSignal) => {
      calls.push(provider);
      if (provider === "p1") {
        signal.addEventListener("abort", () => {
          primaryAborted = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { sources: [source("https://p1.example/late", "P1 late")] };
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { sources: [source("https://p2.example/fast", "P2 fast")] };
    },
    { hedgeDelayMs: 40, timeoutMs: 2000 },
  );

  assert.deepEqual(calls, ["p1", "p2"]);
  assert.equal(outcome.hedgedLaunched, true);
  assert.equal(outcome.backend, "p2");
  assert.equal(outcome.sources[0].url, "https://p2.example/fast");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(primaryAborted, true, "the losing lane must be cancelled, not left running");
});

test("hedged: a slow primary that still finishes first is returned, not the hedge", async () => {
  const outcome = await runHedgedSearch(
    ["p1", "p2"],
    async (provider) => {
      if (provider === "p1") {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return { sources: [source("https://p1.example/ok", "P1")] };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { sources: [source("https://p2.example/slow", "P2")] };
    },
    { hedgeDelayMs: 30, timeoutMs: 2000 },
  );

  assert.equal(outcome.backend, "p1");
  assert.equal(outcome.sources[0].url, "https://p1.example/ok");
});

test("fused: both lanes run and their lists are merged with RRF", async () => {
  const calls: string[] = [];
  const outcome = await runHedgedSearch(
    ["p1", "p2"],
    async (provider: string, _signal: AbortSignal, _lane: LaneRole) => {
      calls.push(provider);
      await new Promise((resolve) => setTimeout(resolve, 10));
      return provider === "p1"
        ? { sources: [source("https://common.example/page", "common p1"), source("https://p1.example/only", "p1 only")] }
        : { sources: [source("https://p2.example/only", "p2 only"), source("https://common.example/page?utm_source=x", "common p2")] };
    },
    { mode: "fused", hedgeDelayMs: 30, timeoutMs: 2000 },
  );

  assert.deepEqual(calls.sort(), ["p1", "p2"]);
  assert.equal(outcome.fused, true);
  assert.equal(outcome.backend, "p1+p2");
  assert.equal(outcome.sources.length, 3);
  // The URL seen by both providers wins on the summed RRF score.
  assert.equal(outcome.sources[0].url, "https://common.example/page");
});

test("no lane produced results: the last failure is surfaced", async () => {
  await assert.rejects(
    () =>
      runHedgedSearch(
        ["p1", "p2"],
        async (provider) => {
          const err = new Error(`${provider} down`) as Error & { code: string };
          err.code = "network";
          throw err;
        },
        { mode: "fused", timeoutMs: 500 },
      ),
    /p1 down/,
  );
});

test("an already-aborted caller signal rejects without calling a provider", async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(
    () =>
      runHedgedSearch(
        ["p1", "p2"],
        async () => {
          called = true;
          return { sources: [] };
        },
        { signal: controller.signal },
      ),
    /aborted/i,
  );
  assert.equal(called, false);
});
