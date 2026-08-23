/**
 * Direct apply() runtime wiring test:
 * Verifies that apply(ctx) registers routed search & fetch providers into ctx.web
 * and that platform queries are dispatched through SpecializedSourceRegistry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../src/host/index.ts";
import { defaultSourceRegistry } from "../src/host/sources/registry.ts";
import type { SpecializedSource, SourceStatus, SourceSearchRequest, SourceSearchOutcome, SourceFetchOutcome } from "../src/host/sources/types.ts";

test("Runtime Wiring: apply(ctx) registers routed providers into ctx.web", async () => {
  let registeredSearchProvider: any = null;
  let registeredFetchProvider: any = null;
  let registeredUpgradeRoute: any = null;

  const mockCtx: any = {
    webServer: {
      register: () => () => {},
      registerUpgrade: (route: any) => {
        registeredUpgradeRoute = route;
        return () => {};
      },
    },
    webRuntime: {
      trustedHosts: ["127.0.0.1", "localhost"],
    },
    settings: {
      register: () => ({
        get: () => ({ enabled: true, defaultProvider: "exa", fallbackOrder: [] }),
        watch: () => () => {},
        update: async () => {},
        replace: async () => {},
      }),
      describe: () => [],
      update: async () => {},
    },
    credentials: {
      resolve: async () => ({ value: "test-key" }),
      set: async () => {},
      unset: async () => {},
      describe: async () => ({}),
    },
    web: {
      registerSearchProvider: (p: any) => {
        registeredSearchProvider = p;
        return () => {};
      },
      registerFetchProvider: (p: any) => {
        registeredFetchProvider = p;
        return () => {};
      },
    },
    effect: (fn: any) => {
      fn();
    },
    inject: (_services: any, cb: any) => cb(mockCtx),
    on: () => () => {},
    emit: () => {},
  };

  apply(mockCtx);

  assert.ok(registeredSearchProvider, "Search provider must be registered on ctx.web");
  assert.ok(registeredFetchProvider, "Fetch provider must be registered on ctx.web");
  assert.ok(registeredUpgradeRoute, "Upgrade route must be registered on webServer");
  assert.equal(registeredUpgradeRoute.path, "/web-tools/bridge/ws");

  // Verify that registered search provider routes XHS query to SpecializedSource
  let xhsHandled = false;
  const mockXhs: SpecializedSource = {
    id: "xiaohongshu",
    async probe(): Promise<SourceStatus> {
      return { id: "xiaohongshu", enabled: true, bridgeConnected: true, authenticated: true };
    },
    async search(): Promise<SourceSearchOutcome> {
      xhsHandled = true;
      return {
        id: "xiaohongshu",
        mode: "native-browser",
        sources: [{ url: "https://www.xiaohongshu.com/explore/12345?xsec_token=ABC", title: "Wiring Success" }],
        latencyMs: 50,
      };
    },
    async fetch(): Promise<SourceFetchOutcome> {
      return { id: "xiaohongshu", mode: "native-browser", url: "https://www.xiaohongshu.com/explore/12345", latencyMs: 50 };
    },
  };

  defaultSourceRegistry.register(mockXhs);

  const res = await registeredSearchProvider.search({ query: "小红书上最好的相机推荐" });
  assert.equal(xhsHandled, true, "Routed search provider on ctx.web must dispatch to XiaohongshuSource");
  assert.equal(res.sources[0].title, "Wiring Success");
});
