/**
 * Tool-registry scope-merge integration test (RUNTIME, not inference).
 *
 * Boots the REAL dsh-tools registry + dsh-tool-web plugin + dsh-scope over a
 * real Cordis context, reproducing the exact layer topology the web profile
 * composes, then asserts what a bound agent scope actually sees.
 *
 *   global   — host `tool-web` row (fetch: true  → registers web_search + web_fetch)
 *   standing — agent preset `tool-web` row (fetch: false → registers web_search ONLY)
 *   agent    — session scope, bound to the standing scope as its parent
 *
 * Verifies the two facts that matter:
 *   1. A preset's `fetch: false` does NOT tombstone the global `web_fetch`:
 *      the merged agent view still contains it (attributed to global).
 *   2. A preset with NO tool-web row (e.g. `minimal`) inherits the global web
 *      tools — the isolation side-effect of enabling tool-web on the host plane.
 *
 * ENVIRONMENT-GATED: `dsh-tool-web` and `dsh-web` live INSIDE the DSH
 * installation, not in this repo's dependency tree (they are not declared
 * anywhere in package.json). When neither the DSH install nor an override
 * env var can resolve them, the suite SKIPS instead of failing — so CI
 * (which installs only this repo's deps) stays green while a local machine
 * with DSH installed still verifies the runtime contract.
 *
 * Run: node --experimental-strip-types --test test/tool-registry.integration.test.mjs
 * Override the DSH install root with: DSH_TOOL_WEB_NM=<path-to-@deepseek-ai-dir>
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// test/ -> repo root
const repoRoot = join(here, "..");
// Resolve the repo's own @deepseek-ai dir WITHOUT hardcoding an absolute path.
const NM = join(repoRoot, "node_modules", "@deepseek-ai").replace(/\\/g, "/");

/**
 * dsh-tool-web / dsh-web live INSIDE the DSH installation (peer of the host
 * composition), not in this repo's node_modules. Their exact location depends
 * on how the DSH install is laid out (nvm-managed vs. plain global), so probe
 * the known candidates at load time. DSH_TOOL_WEB_NM always wins when set.
 */
const DSH_NM_CANDIDATES = [
  process.env.DSH_TOOL_WEB_NM,
  "D:/Develop/nvm/v22.22.1/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai",
  "D:/Develop/nodejs/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai",
].filter(Boolean);
const hasToolWeb = (base) =>
  !!base && existsSync(join(base, "dsh-tool-web", "lib", "index.js"));
const DSH_NM = DSH_NM_CANDIDATES.find(hasToolWeb);

const load = (base, pkg) => import(pathToFileURL(`${base}/${pkg}/lib/index.js`).href);

const envReady =
  !!DSH_NM &&
  existsSync(join(NM, "cordis", "lib", "index.js")) &&
  existsSync(join(NM, "dsh-scope", "lib", "index.js")) &&
  existsSync(join(NM, "dsh-tools", "lib", "index.js")) &&
  existsSync(join(NM, "dsh-system-prompt", "lib", "index.js")) &&
  existsSync(join(DSH_NM, "dsh-web", "lib", "index.js")) &&
  existsSync(join(DSH_NM, "dsh-tool-web", "lib", "index.js"));

const SKIP_REASON = envReady
  ? false
  : "dsh-tool-web / dsh-web not resolvable (requires a DSH install; skipped in CI)";

// Only import the runtime when it is actually available — otherwise even the
// top-level imports would crash the file before `test()` gets a chance to skip.
let rt = null;
if (envReady) {
  const { Context } = await load(NM, "cordis");
  const { createScope, bindScopeParent, scopeOf } = await load(NM, "dsh-scope");
  const { ToolRuntime } = await load(NM, "dsh-tools");
  const { SystemPrompt } = await load(NM, "dsh-system-prompt");
  const { WebRuntime } = await load(DSH_NM, "dsh-web");
  const { apply: applyToolWeb, inject: toolWebInject } = await load(DSH_NM, "dsh-tool-web");
  rt = { Context, createScope, bindScopeParent, scopeOf, ToolRuntime, SystemPrompt, WebRuntime, applyToolWeb, toolWebInject };
}

/** The exact config dsh-web-tools' patch now sets on the host tool-web row. */
const HOST_TOOL_WEB_CONFIG = {
  search: true,
  fetch: true,
  searchMaxResults: 8,
  searchTimeoutMs: 60000,
  fetchTimeoutMs: 30000,
  fetchMaxOutputChars: 200000,
};
/** The exact config the shipped standard preset sets on its tool-web row. */
const PRESET_TOOL_WEB_CONFIG = {
  search: true,
  fetch: false,
  searchMaxResults: 8,
  searchTimeoutMs: 60000,
  fetchTimeoutMs: 30000,
  fetchMaxOutputChars: 200000,
};

function stubSearchProvider(id) {
  return {
    id,
    available: () => true,
    async search(request, _signal) {
      return { content: undefined, sources: [{ url: "https://stub.example", title: id }], truncated: false };
    },
  };
}
function stubFetchProvider(id) {
  return {
    id,
    available: () => true,
    async fetch(request, _signal) {
      return { url: request.url, statusCode: 200, body: { kind: "text", content: "stub" }, truncated: false };
    },
  };
}

async function buildRoot() {
  const { Context, ToolRuntime, SystemPrompt, WebRuntime, applyToolWeb, toolWebInject } = rt;
  const root = new Context();
  await root.plugin(SystemPrompt, {});
  await root.plugin(ToolRuntime, { mode: "native" });
  await root.plugin(WebRuntime, {});
  root.web.registerSearchProvider(stubSearchProvider("dsh-web-tools"));
  root.web.registerFetchProvider(stubFetchProvider("dsh-web-tools-fetch"));
  // host tool-web (global layer)
  await root.plugin({ name: "tool-web", inject: toolWebInject, apply: applyToolWeb }, HOST_TOOL_WEB_CONFIG);
  return root;
}

test(
  "preset fetch:false does NOT tombstone the global web_fetch",
  { skip: SKIP_REASON },
  async () => {
    const root = await buildRoot();
    const { createScope, bindScopeParent, scopeOf } = rt;
    // standing scope = the standard preset's tool-web (fetch: false)
    const standing = createScope(root, { agentPreset: "standard" });
    await standing.ctx.plugin(
      { name: "tool-web", inject: rt.toolWebInject, apply: rt.applyToolWeb },
      PRESET_TOOL_WEB_CONFIG,
    );
    // agent scope bound to the standing scope
    const agent = createScope(root, { session: "s1" });
    bindScopeParent(scopeOf(agent.ctx), scopeOf(standing.ctx));

    const layers = root.tools.layers;
    const globalLayer = layers.global;
    const standingLayer = layers.peek(scopeOf(standing.ctx));

    // layer keys — the real registry entries, not an inference
    const globalKeys = [...globalLayer.tools.entries()].map(([name]) => name);
    const standingKeys = standingLayer ? [...standingLayer.tools.entries()].map(([name]) => name) : [];
    assert.deepEqual(globalKeys.sort(), ["web_fetch", "web_search"], "global (host fetch:true) registers both");
    assert.deepEqual(standingKeys, ["web_search"], "standing (preset fetch:false) registers search ONLY");

    // merged agent view
    const view = root.tools.view(scopeOf(agent.ctx));
    assert.ok(view.visible.has("web_search"), "agent sees web_search");
    assert.ok(view.visible.has("web_fetch"), "agent sees web_fetch — preset did NOT hide it");
    assert.ok(view.visible.get("web_search") !== globalLayer.tools.entries().find(([n]) => n === "web_search")?.[1],
      "web_search resolved from the standing layer (preset shadows host search)");
    assert.ok(view.visible.get("web_fetch") === globalLayer.tools.entries().find(([n]) => n === "web_fetch")?.[1],
      "web_fetch resolved from the global layer (no preset shadow)");

    await root.stop?.();
  },
);

test(
  "a preset without tool-web (minimal) inherits the global web tools",
  { skip: SKIP_REASON },
  async () => {
    const root = await buildRoot();
    const { createScope, bindScopeParent, scopeOf } = rt;
    // minimal preset has NO tool-web row → its standing layer registers nothing
    const minimal = createScope(root, { agentPreset: "minimal" });
    // (no tool-web plugin applied on this scope)
    const agent = createScope(root, { session: "s2" });
    bindScopeParent(scopeOf(agent.ctx), scopeOf(minimal.ctx));

    const view = root.tools.view(scopeOf(agent.ctx));
    assert.ok(view.visible.has("web_search"), "minimal agent inherits web_search from global");
    assert.ok(view.visible.has("web_fetch"), "minimal agent inherits web_fetch from global — host-plane enablement leaks");

    await root.stop?.();
  },
);
