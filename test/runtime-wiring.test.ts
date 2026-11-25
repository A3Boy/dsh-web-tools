/**
 * Direct apply() runtime wiring test:
 * Verifies that apply(ctx) registers routed search & fetch providers into ctx.web
 * and that platform queries are dispatched through SpecializedSourceRegistry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import * as hostPlugin from "../src/host/index.ts";
import { apply, toRoutedFetchResponse, executeRoutedFetchWithRecovery } from "../src/host/index.ts";

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
  assert.equal(registeredSearchProvider.id, "dsh-web-tools", "Search provider id must match patch config");
  assert.equal(registeredFetchProvider.id, "dsh-web-tools-fetch", "Fetch provider id must be dsh-web-tools-fetch");
});

test("Runtime Wiring: routed fetch never turns source failures or empty content into HTTP 200", () => {
  const url = "https://www.xiaohongshu.com/discovery/item/6a0ec5410000000038037228";

  assert.throws(
    () => toRoutedFetchResponse(url, {
      error: { code: "parse-failed", message: "Could not extract note detail", retryable: true },
    }),
    /parse-failed.*Could not extract note detail/i,
  );

  assert.throws(
    () => toRoutedFetchResponse(url, {
      item: { id: url, title: "小红书笔记", url, text: "", platform: "xiaohongshu" },
    }),
    /empty content/i,
  );

  const response = toRoutedFetchResponse(url, {
    item: {
      id: url,
      title: "小红书笔记",
      url,
      text: "正文",
      author: { name: "作者" },
      likes: 12,
      replies: 3,
      platform: "xiaohongshu",
    },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.content, /^# 小红书笔记/);
  assert.match(response.body.content, /Author: 作者/);
  assert.match(response.body.content, /Engagement: likes 12, comments\/replies 3/);
  assert.match(response.body.content, /\n\n正文$/);
});

test("Runtime Wiring: executeRoutedFetchWithRecovery recovers content from cache when native fetch fails", async () => {
  const url = "https://www.xiaohongshu.com/explore/698c3f460000000016008c28";

  const response = await executeRoutedFetchWithRecovery(
    url,
    async () => ({
      error: { code: "blocked", message: "Xiaohongshu detail navigation redirected away from target note 698c3f460000000016008c28", retryable: false },
    }),
    {
      lookupCache: (lookupUrl) => ({
        id: "698c3f460000000016008c28",
        title: "小红书缓存笔记标题",
        url: lookupUrl,
        snippet: "搜索结果缓存正文摘要",
        author: { name: "缓存博主" },
        likes: 999,
        platform: "xiaohongshu",
      }),
    },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body.content, /# 小红书缓存笔记标题/);
  assert.match(response.body.content, /Author: 缓存博主/);
  assert.match(response.body.content, /Engagement: likes 999/);
  assert.match(response.body.content, /搜索结果缓存正文摘要/);
});

test("Runtime Wiring: executeRoutedFetchWithRecovery recovers content from search fallback when native fetch is blocked", async () => {
  const url = "https://www.xiaohongshu.com/explore/698c3f460000000016008c28";

  const response = await executeRoutedFetchWithRecovery(
    url,
    async () => ({
      error: { code: "blocked", message: "Xiaohongshu detail navigation redirected away from target note 698c3f460000000016008c28", retryable: false },
    }),
    {
      searchFallback: async () => "网络搜索索引摘录的正文内容",
    },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body.content, /网络搜索索引摘录的正文内容/);
});

test("Runtime Wiring: executeRoutedFetchWithRecovery returns graceful diagnostic response on 300031 platform restriction instead of crashing", async () => {
  const url = "https://www.xiaohongshu.com/explore/698c3f460000000016008c28";

  const response = await executeRoutedFetchWithRecovery(
    url,
    async () => ({
      error: {
        code: "blocked",
        message: "Xiaohongshu detail navigation redirected away from target note 698c3f460000000016008c28 (小红书提示 300031: 当前笔记暂时无法浏览，可能已被作者删除、设为私密或缺少有效 xsec_token)",
        retryable: false,
      },
    }),
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body.content, /300031/);
  assert.match(response.body.content, /当前笔记暂时无法浏览/);
  assert.match(response.metadata?.title ?? "", /300031/);
});

test("Runtime Wiring: web_read registration respects persisted webReadEnabled=false on mount", async () => {
  let registeredTools = 0;
  let settingsCb: ((sctx: any) => void) | undefined;

  const mockCtx: any = {
    webServer: { register: () => () => {}, registerUpgrade: () => () => {} },
    webRuntime: { trustedHosts: ["127.0.0.1"] },
    settings: {
      register: () => ({
        get: () => ({ enabled: true, webReadEnabled: false, defaultProvider: "exa", fallbackOrder: [] }),
        watch: () => () => {},
        update: async () => {},
        replace: async () => {},
      }),
      describe: () => [],
      update: async () => {},
    },
    credentials: { resolve: async () => ({}), set: async () => {}, unset: async () => {}, describe: async () => ({}) },
    web: { registerSearchProvider: () => () => {}, registerFetchProvider: () => () => {} },
    tools: {
      register: () => {
        registeredTools++;
        return () => { registeredTools--; };
      },
    },
    effect: (fn: any) => { fn(); },
    inject: (services: string[], cb: any) => {
      if (services.includes("settings")) settingsCb = cb;
      else cb(mockCtx);
    },
    on: () => () => {},
    emit: () => {},
  };

  apply(mockCtx);
  // Before settings mount, default was true, then settings mount sets webReadEnabled=false -> unregistered!
  settingsCb?.(mockCtx);
  assert.equal(registeredTools, 0, "persisted webReadEnabled=false must unregister web_read once settings mount");
});

test("Runtime Wiring (real Cordis Context): activates without un-injected tools error and wires optional tools + agent scope safely", async () => {
  const root = new Context();
  const registeredTools = new Map<string, unknown>();
  let searchProviderId: string | undefined;
  let fetchProviderId: string | undefined;
  let searchCommandHandler: ((inv: any) => any) | undefined;

  await root.plugin({
    name: "host-stubs",
    apply(ctx: any) {
      ctx.provide("webServer", { register: () => () => {}, registerUpgrade: () => () => {} });
      ctx.provide("settings", { configure: () => () => {}, update: async () => {} });
      ctx.provide("credentials", {
        resolve: async () => undefined,
        set: async () => {},
        unset: async () => {},
        describe: async () => ({}),
      });
      ctx.provide("web", {
        registerSearchProvider: (p: any) => { searchProviderId = p.id; return () => {}; },
        registerFetchProvider: (p: any) => { fetchProviderId = p.id; return () => {}; },
      });
      ctx.provide("agents", { get: () => undefined, list: () => [] });
      ctx.provide("commands", {
        register: (def: any) => {
          if (def.name === "search") searchCommandHandler = def.handler;
          return () => {};
        },
      });
    },
  });

  // 1. Activate plugin on a real Cordis Context WITHOUT `tools` service registered at all:
  //    must NOT throw `Error: cannot get property "tools" without inject`.
  const pluginFiber = await root.plugin(hostPlugin as any, {
    enabled: true,
    webReadEnabled: true,
    defaultProvider: "exa",
    providerAttemptTimeoutMs: 10000,
    fallbackOrder: [],
    providerBaseUrls: {},
    providerEnabled: {},
    platformEnabled: { xiaohongshu: true, x: true },
    providerOptions: {},
    braveQuotaCache: {},
    keenableUsageCache: {},
    searchRoutingPolicy: "ordered",
    retrievalStrategy: "single",
    sessionKeepAliveHours: 0,
    customProviders: [],
    outboundAuthorizations: [],
  });
  assert.equal(pluginFiber.state, 2, "plugin fiber must reach active state (2) without tools service");
  assert.equal(searchProviderId, "dsh-web-tools");
  assert.equal(fetchProviderId, "dsh-web-tools-fetch");

  // 2. Now provide `tools` dynamically: optional `ctx.inject(['tools'])` mounts `web_read`.
  let restrictedDeny: readonly string[] | undefined;
  let registeredGuard: ((exec: { name: string }) => string | undefined) | undefined;
  const toolsFiber = await root.plugin({
    name: "tools-stub",
    apply(ctx: any) {
      ctx.provide("tools", {
        register: (def: any) => {
          registeredTools.set(def.name, def);
          return () => { registeredTools.delete(def.name); };
        },
        restrict: (filter: { deny?: readonly string[] }) => {
          restrictedDeny = filter.deny;
          return () => { restrictedDeny = undefined; };
        },
        guard: (fn: (exec: { name: string }) => string | undefined) => {
          registeredGuard = fn;
          return () => { registeredGuard = undefined; };
        },
        // Simulate web_read disabled/absent from global restrictable set (only web_search + web_fetch present)
        view: () => ({ restrictableNames: new Set(["web_search", "web_fetch"]) }),
      });
    },
  });
  assert.ok(registeredTools.has("web_read"), "web_read must register once optional tools service mounts");

  // 3. Simulate SessionController creating an agent WITHOUT injecting `tools` on its own fiber:
  //    `agent.ctx` must NOT throw `cannot get property "tools" without inject` on `agent/created` or `agent/pre-step`.
  let sessionOwnerCtx: any;
  await root.plugin({
    name: "session-controller-like",
    inject: ["agents"],
    apply(ctx: any) {
      sessionOwnerCtx = ctx;
    },
  });
  const agentScopeFiber = sessionOwnerCtx.plugin(() => {});
  const fakeAgent = {
    id: "sess-cordis-1",
    session: { deriveMessages: () => [] },
    ctx: agentScopeFiber.ctx,
    steer: () => {},
    cancel: () => {},
  };

  // Toggle session mode to `off` via /search command (auto -> required -> off)
  assert.ok(searchCommandHandler, "/search command must be registered");
  searchCommandHandler!({ agent: fakeAgent, rawInput: "" });
  searchCommandHandler!({ agent: fakeAgent, rawInput: "" });

  await (root as any).serial("agent/created", { agent: fakeAgent, source: "startup" });
  assert.ok(registeredGuard, "guard must be installed via agent.ctx.get('tools') without inject error");
  assert.deepEqual(
    restrictedDeny,
    ["web_search", "web_fetch"],
    "restrict must filter out unregistered tools so dsh-tools does not throw on unknown global tool",
  );
  assert.ok(registeredGuard!({ name: "web_read" })?.includes("OFF"), "guard still blocks web_read when OFF");

  // 4. Unloading `tools` cleans up `web_read` and allows re-registration on reload.
  await toolsFiber.dispose();
  assert.equal(registeredTools.has("web_read"), false);
  await pluginFiber.dispose();
});
