/**
 * dsh-web-tools — Host configuration & DSH 0.1.7 compatibility tests (Issue #7).
 *
 * Verifies that:
 * 1. Under DSH 0.1.7+ (where SettingsForms has no register() method), installConfig
 *    respects initial config passed from the loader, flushes onMounted, updates in-memory
 *    state and delegates writes to sctx.settings.update("dsh-web-tools", patch).
 * 2. Under DSH pre-0.1.7 (where sctx.settings.register exists), backward compatibility
 *    is preserved.
 * 3. Volatile getter nodes in initial config are properly unwrapped.
 * 4. Write attempts before mount throw "dsh-web-tools settings namespace is not mounted".
 * 5. apply(ctx, config) propagates loader config into search runtime without falling back to exa.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installConfig, DEFAULT_SETTINGS, SETTINGS_NS, Config } from "../src/host/config.ts";
import { apply } from "../src/host/index.ts";

test("installConfig DSH 0.1.7+: reads initial config and writes via service.update", async () => {
  let mountedRan = false;
  let updateCalledWith: { ns: string; patch: any } | null = null;
  let configureCalledWith: any = null;

  const mockSettings = {
    // Note: register() is deliberately absent (DSH 0.1.7+)
    async update(ns: string, patch: any) {
      updateCalledWith = { ns, patch };
    },
    configure(opts: any) {
      configureCalledWith = opts;
    },
  };

  const mockCtx: any = {
    inject: (deps: string[], cb: (sctx: any) => void) => {
      if (deps.includes("settings")) {
        cb({ settings: mockSettings });
      }
    },
    effect: (fn: () => void) => fn(),
  };

  const initialConfig = {
    defaultProvider: "tavily",
    fallbackOrder: ["brave", "searxng"],
    providerAttemptTimeoutMs: 15000,
  };

  const handle = installConfig(mockCtx, initialConfig);
  handle.onMounted(() => {
    mountedRan = true;
  });

  assert.equal(mountedRan, true, "onMounted must run once injected");
  assert.equal(handle.read().defaultProvider, "tavily", "must retain initialConfig defaultProvider");
  assert.deepEqual(handle.read().fallbackOrder, ["brave", "searxng"]);
  assert.equal(handle.read().providerAttemptTimeoutMs, 15000);
  assert.equal(handle.read().enabled, DEFAULT_SETTINGS.enabled, "missing keys fallback to default");

  // Write a patch
  await handle.write({ defaultProvider: "brave" });
  assert.equal(handle.read().defaultProvider, "brave", "in-memory config must update immediately");
  assert.deepEqual(updateCalledWith, {
    ns: SETTINGS_NS,
    patch: { defaultProvider: "brave" },
  }, "must delegate write to settings.update(SETTINGS_NS, patch)");
  assert.deepEqual(configureCalledWith, { auto: false }, "must configure auto: false to prevent empty page");
});

test("installConfig DSH pre-0.1.7: backwards compatible with settings.register", async () => {
  let mountedRan = false;
  let scopeUpdateCalledWith: any = null;

  const fakeRegistered = {
    get: () => ({ ...DEFAULT_SETTINGS, defaultProvider: "searxng" }),
    update: async (patch: any) => {
      scopeUpdateCalledWith = patch;
    },
  };

  const mockSettings = {
    register: (ns: string, schema: any, opts: any) => {
      assert.equal(ns, SETTINGS_NS);
      return fakeRegistered;
    },
  };

  const mockCtx: any = {
    inject: (deps: string[], cb: (sctx: any) => void) => {
      if (deps.includes("settings")) {
        cb({ settings: mockSettings });
      }
    },
  };

  const handle = installConfig(mockCtx);
  handle.onMounted(() => {
    mountedRan = true;
  });

  assert.equal(mountedRan, true);
  assert.equal(handle.read().defaultProvider, "searxng");

  await handle.write({ enabled: false });
  assert.deepEqual(scopeUpdateCalledWith, { enabled: false });
});

test("installConfig: unwraps volatile getters in initial config", () => {
  const mockCtx: any = {
    inject: (_deps: any, cb: any) => cb({ settings: {} }),
  };

  const initialWithGetters = {
    defaultProvider: {
      get: () => "tavily",
    },
    providerAttemptTimeoutMs: {
      get: () => 12000,
    },
    nested: {
      foo: {
        get: () => "bar",
      },
    },
  };

  const handle = installConfig(mockCtx, initialWithGetters as any);
  assert.equal(handle.read().defaultProvider, "tavily");
  assert.equal(handle.read().providerAttemptTimeoutMs, 12000);
});

test("installConfig: throws when write called without mounted settings service", async () => {
  const mockCtx: any = {
    inject: () => {}, // inject never calls back
  };

  const handle = installConfig(mockCtx);
  await assert.rejects(
    async () => {
      await handle.write({ defaultProvider: "brave" });
    },
    /dsh-web-tools settings namespace is not mounted/,
  );
});

test("apply(ctx, config): passes loader config into search runtime without falling back to exa", async () => {
  let registeredSearchProvider: any = null;
  const mockSettings = {
    async update() {},
    configure() {},
  };

  const mockCtx: any = {
    webServer: { register: () => () => {}, registerUpgrade: () => () => {} },
    webRuntime: { trustedHosts: ["127.0.0.1"] },
    settings: mockSettings,
    credentials: {
      resolve: async (ref: string) => (ref === "WEB_TOOLS_TAVILY" ? { value: "tvly-test-key" } : { value: "" }),
      set: async () => {},
      unset: async () => {},
    },
    web: {
      registerSearchProvider: (p: any) => { registeredSearchProvider = p; },
      registerFetchProvider: () => {},
    },
    effect: (fn: any) => fn(),
    inject: (_deps: any, cb: any) => cb(mockCtx),
    on: () => () => {},
  };

  apply(mockCtx, { defaultProvider: "tavily" });

  assert.ok(registeredSearchProvider);
  assert.equal(registeredSearchProvider.available(), true, "search provider must be available with tavily key");
});

/**
 * DSH gates plugin activation on `peerDependencies` by calling
 * `semver.satisfies(runtimeVersion, range, { includePrerelease: true })` for
 * every `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` name (dsh-app-boot). Use the
 * REAL semver as the oracle rather than a hand-rolled approximation: a wrong
 * range silently blocks installation/activation, which is exactly how the
 * 0.2.0 line was refused by a `^0.1.0-rc.6`-only range.
 */
const DSH_RUNTIME_LINES = [
  "0.1.5-rc.3", // oldest line exercised here
  "0.1.7-rc.2", // the running host when the 0.1.7 breakages were reported
  "0.2.0-rc.1", // first 0.2 line published
  "0.2.0-rc.2", // current `latest` and `next`
  "0.2.1-alpha.1", // current `alpha`; admitted by the range's semantics, not a support claim
];

test("every DSH peer range admits every published runtime line", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const semver = (await import("semver")).default;
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const peers = (pkg.peerDependencies ?? {}) as Record<string, string>;

  const gated = Object.entries(peers).filter(
    ([name]) => name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-"),
  );
  assert.ok(gated.length > 0, "the plugin must declare at least one gated DSH peer");

  for (const runtime of DSH_RUNTIME_LINES) {
    for (const [name, range] of gated) {
      assert.ok(
        semver.satisfies(runtime, range, { includePrerelease: true }),
        `peer ${name} range "${range}" must satisfy DSH runtime ${runtime}`,
      );
    }
  }
});

test("the 0.1-only range that previously blocked 0.2.x is no longer in use", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const semver = (await import("semver")).default;
  const peers = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"))
    .peerDependencies as Record<string, string>;

  // Guards the regression itself: a bare ^0.1.0-rc.6 range refuses every 0.2.x
  // prerelease, so the plugin would be denied installation/activation there.
  assert.equal(
    semver.satisfies("0.2.0-rc.2", "^0.1.0-rc.6", { includePrerelease: true }),
    false,
    "precondition: a 0.1-only range must refuse 0.2.x (this is the bug being guarded)",
  );
  for (const [name, range] of Object.entries(peers)) {
    if (name.startsWith("@deepseek-ai/dsh-")) {
      assert.ok(
        semver.satisfies("0.2.0-rc.2", range, { includePrerelease: true }),
        `peer ${name} must keep admitting the 0.2 line (range: "${range}")`,
      );
    }
  }
});
