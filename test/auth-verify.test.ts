/**
 * Platform session verification: one transient failure must not be fatal.
 *
 * A just-launched browser (or a concurrently closing target) can make the first
 * `verifyAuthenticationForOperation` probe report "signed out" for a perfectly
 * valid profile. Before the retry existed, that surfaced as a hard
 * `[auth-required]` error on the very first search after startup.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { verifyPlatformSession } from "../src/host/sources/auth.ts";

function runtimeReturning(results: boolean[]) {
  const calls: Array<{ platform: string; mode?: string }> = [];
  return {
    calls,
    runtime: {
      verifyAuthenticationForOperation: async (platform: string, _signal?: AbortSignal, mode?: string) => {
        calls.push({ platform, mode });
        const value = results.length > 1 ? results.shift()! : results[0];
        return value ?? false;
      },
    },
  };
}

test("verifyPlatformSession: a transient false is retried once", async () => {
  const { calls, runtime } = runtimeReturning([false, true]);
  const ok = await verifyPlatformSession(runtime as any, "xiaohongshu", undefined, "interactive");
  assert.equal(ok, true);
  assert.equal(calls.length, 2, "the probe must run twice");
  assert.equal(calls[0].mode, "interactive");
});

test("verifyPlatformSession: a genuinely signed-out account fails after two probes", async () => {
  const { calls, runtime } = runtimeReturning([false]);
  const ok = await verifyPlatformSession(runtime as any, "x");
  assert.equal(ok, false);
  assert.equal(calls.length, 2);
});

test("verifyPlatformSession: a successful first probe does not retry", async () => {
  const { calls, runtime } = runtimeReturning([true]);
  const ok = await verifyPlatformSession(runtime as any, "x");
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
});

test("verifyPlatformSession: an aborted caller never retries", async () => {
  const controller = new AbortController();
  const { calls, runtime } = runtimeReturning([false]);
  const pending = verifyPlatformSession(runtime as any, "x", controller.signal);
  controller.abort();
  const ok = await pending;
  assert.equal(ok, false);
  assert.equal(calls.length, 1);
});
