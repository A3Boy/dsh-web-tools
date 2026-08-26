import assert from "node:assert/strict";
import test from "node:test";
import { SpecializedSourceRegistry } from "../src/host/sources/registry.ts";
import { BraveQuotaManager, braveQuotaFromHeaders } from "../src/host/providers/brave.ts";
import type { SpecializedSource, SourceStatus, SourceSearchOutcome, SourceFetchOutcome } from "../src/host/sources/types.ts";

test("Phase 3: 1. two independent SpecializedSourceRegistries operate in isolation", async () => {
  const reg1 = new SpecializedSourceRegistry();
  const reg2 = new SpecializedSourceRegistry();

  const source1: SpecializedSource = {
    id: "x",
    name: "Twitter / X (1)",
    async status(): Promise<SourceStatus> {
      return {
        id: "x",
        name: "Twitter / X (1)",
        enabled: true,
        runtimeAvailable: true,
        runtimeState: "ready",
        authenticated: true,
      };
    },
    async search(): Promise<SourceSearchOutcome> {
      return { items: [{ id: "1", title: "Reg 1", url: "https://x.com/1", platform: "x" }] };
    },
    async fetch(): Promise<SourceFetchOutcome> {
      return { item: { id: "1", title: "Reg 1", url: "https://x.com/1", text: "Reg 1", platform: "x" } };
    },
  };

  reg1.registerSource(source1);
  reg1.setPlatformEnabled({ x: true });

  assert.equal(reg1.getSource("x")?.name, "Twitter / X (1)");
  assert.equal(reg2.getSource("x"), undefined);

  const stat1 = await reg1.getPlatformStatuses();
  const stat2 = await reg2.getPlatformStatuses();
  assert.equal(stat1.find((s) => s.id === "x")?.name, "Twitter / X (1)");
  assert.equal(stat2.find((s) => s.id === "x")?.name, "Twitter / X");
  assert.equal(stat2.find((s) => s.id === "x")?.runtimeState, "unavailable");
});

test("Phase 3: 2. BraveQuotaManager scopes cache and persist callbacks per instance and releases on dispose", async () => {
  let persistWrites: Array<{ key: string; limit?: number }> = [];
  const manager1 = new BraveQuotaManager((key, snapshot) => {
    persistWrites.push({ key, limit: snapshot.limit });
  });

  manager1.seed("key-1", {
    supported: true,
    authoritative: true,
    unit: "requests",
    source: "response_header",
    fetchedAt: 1000,
    limit: 15000,
    remaining: 14000,
  });

  const snap = await manager1.getQuota("key-1");
  assert.equal(snap.limit, 15000);
  assert.equal(snap.remaining, 14000);

  // Record a new response header snapshot
  const headers = new Headers({
    "x-ratelimit-limit": "1, 20000",
    "x-ratelimit-remaining": "1, 19500",
  });
  manager1.recordFromHeaders("key-1", headers);

  assert.equal(persistWrites.length, 1);
  assert.equal(persistWrites[0].limit, 20000);

  // Dispose manager1 -> persist callback is released and won't write again
  manager1.dispose();
  manager1.recordFromHeaders("key-1", new Headers({ "x-ratelimit-limit": "1, 30000" }));
  assert.equal(persistWrites.length, 1); // No new write after dispose
});
