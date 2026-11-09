import test from "node:test";
import assert from "node:assert/strict";
import { runHedgedSearch } from "../src/host/hedged-search.ts";

test("runHedgedSearch resolves immediately when primary provider is fast and successful", async () => {
  let p2Called = false;
  const mockSearch = async (provider: string) => {
    if (provider === "p1") {
      return { sources: [{ url: "https://p1.com/result", title: "P1" }] };
    }
    p2Called = true;
    return { sources: [{ url: "https://p2.com/result", title: "P2" }] };
  };

  const outcome = await runHedgedSearch(["p1", "p2"], mockSearch, {
    hedgeDelayMs: 200,
  });

  assert.equal(outcome.backend, "p1");
  assert.equal(outcome.hedgedLaunched, false);
  assert.equal(outcome.sources.length, 1);
  assert.equal(outcome.sources[0].url, "https://p1.com/result");
  assert.equal(p2Called, false, "secondary provider must not be called when primary is fast");
});

test("runHedgedSearch triggers secondary provider when primary is slow, fusing results", async () => {
  const mockSearch = async (provider: string) => {
    if (provider === "p1") {
      // simulate slow primary (300ms)
      await new Promise((r) => setTimeout(r, 200));
      return { sources: [{ url: "https://common.com/page", title: "P1 Common" }] };
    }
    // secondary responds quickly (50ms)
    await new Promise((r) => setTimeout(r, 50));
    return { sources: [{ url: "https://common.com/page", title: "P2 Common" }, { url: "https://p2.com/extra", title: "P2 Extra" }] };
  };

  const outcome = await runHedgedSearch(["p1", "p2"], mockSearch, {
    hedgeDelayMs: 80, // fire hedge after 80ms
    timeoutMs: 1000,
  });

  assert.equal(outcome.hedgedLaunched, true);
  assert.equal(outcome.backend, "p1+p2");
  assert.equal(outcome.sources.length, 2);
  // common URL should be first due to RRF fusion score boost
  assert.equal(outcome.sources[0].url, "https://common.com/page");
});
