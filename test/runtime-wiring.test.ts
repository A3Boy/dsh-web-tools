/**
 * Direct apply() runtime wiring test:
 * Verifies that apply(ctx) registers routed search & fetch providers into ctx.web
 * and that platform queries are dispatched through SpecializedSourceRegistry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
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
