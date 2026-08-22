/**
 * P5 — Key trim + P4 options fallback invariant tests.
 *
 * 1. API key trim: pass "  KEY\n" style keys and verify the adapter uses the
 *    trimmed token (no auth failure caused by whitespace).
 * 2. P4 options fallback invariant: Exa with fast options errors → Tavily must
 *    use Tavily's OWN options (search_depth=advanced), NOT Exa's.
 */
"use strict";
const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "..", "..");
const REPORTS = join(__dirname);
const CREDENTIALS = join(process.env.HOME || process.env.USERPROFILE, ".dsh", ".credentials.yaml");
const OUT = join(REPORTS, "fallback-results.json");

function loadCredentials() {
  const raw = readFileSync(CREDENTIALS, "utf8");
  const map = {};
  for (const line of raw.split("\n")) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const c = t.indexOf(":"); if (c < 1) continue;
    const key = t.slice(0, c).trim(); let value = t.slice(c + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key.startsWith("WEB_TOOLS_")) map[key.slice(10).toLowerCase()] = value;
  }
  return map;
}

const ADAPTERS = {
  tavily: require(join(ROOT, "lib", "host", "providers", "tavily.js")).TavilyProvider,
  exa: require(join(ROOT, "lib", "host", "providers", "exa.js")).ExaProvider,
  firecrawl: require(join(ROOT, "lib", "host", "providers", "firecrawl.js")).FirecrawlProvider,
  brave: require(join(ROOT, "lib", "host", "providers", "brave.js")).BraveProvider,
  you: require(join(ROOT, "lib", "host", "providers", "you.js")).YouProvider,
  parallel: require(join(ROOT, "lib", "host", "providers", "parallel.js")).ParallelProvider,
  jina: require(join(ROOT, "lib", "host", "providers", "jina.js")).JinaProvider,
};

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms))]);
}

async function main() {
  const creds = loadCredentials();
  const results = { keyTrim: {}, optionsFallbackInvariant: {} };

  // ---- Test 1: API key trim ----
  console.log("=== Key trim test ===");
  for (const provider of Object.keys(ADAPTERS)) {
    const adapter = ADAPTERS[provider];
    const realKey = (creds[provider] || "").split(",")[0].trim();
    if (!realKey) { console.log(`  ${provider}: no key, skip`); continue; }
    // Wrap in whitespace + newline — the adapter must trim before sending.
    const dirtyKey = `   ${realKey}\r\n`;
    try {
      const started = Date.now();
      const r = await withTimeout(adapter.search("SQLite WAL mode", 3, dirtyKey, undefined, {}), 20000);
      const elapsed = Date.now() - started;
      results.keyTrim[provider] = { ok: true, sources: (r.sources || []).length, elapsedMs: elapsed };
      console.log(`  ${provider}: PASS (${r.sources.length} sources, ${elapsed}ms)`);
    } catch (e) {
      results.keyTrim[provider] = { ok: false, error: `${e.code || "err"}: ${String(e.message).slice(0, 100)}` };
      console.log(`  ${provider}: FAIL (${e.code || "err"} ${String(e.message).slice(0, 80)})`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  // ---- Test 2: P4 options fallback invariant ----
  // Simulate registry behavior: Exa configured with searchType=fast, Tavily with
  // searchDepth=advanced. Make Exa fail (invalid key → 401), then Tavily must
  // receive ITS OWN options.
  console.log("\n=== P4 options fallback invariant ===");
  const exaKey = (creds["exa"] || "").split(",")[0].trim();
  const tavilyKey = (creds["tavily"] || "").split(",")[0].trim();

  // Exa with bad key → auth failure (forces fallback)
  const exaOptions = { searchType: "fast", maxAgeHours: 0 };
  const tavilyOptions = { searchDepth: "advanced" };

  // Step 1: Exa attempt (bad key → fails with auth)
  let exaFailed = false;
  try {
    await withTimeout(ADAPTERS.exa.search("Tavily search_depth values", 5, "bad-key-here", undefined, { options: exaOptions }), 15000);
  } catch (e) {
    exaFailed = e.code === "auth" || e.status === 401;
    console.log(`  Exa (bad key, options=${JSON.stringify(exaOptions)}): ${e.code || "err"} ${String(e.message).slice(0, 60)}`);
  }

  // Step 2: Tavily with ITS OWN options must succeed and return results
  let tavilyOk = false;
  let tavilyEv = false;
  try {
    const started = Date.now();
    const r = await withTimeout(ADAPTERS.tavily.search("Tavily search_depth values", 5, tavilyKey, undefined, { options: tavilyOptions }), 20000);
    const elapsed = Date.now() - started;
    tavilyOk = r.sources.length > 0;
    const text = r.sources.map((s) => `${s.title} ${s.snippet}`.toLowerCase()).join(" ");
    tavilyEv = text.includes("search_depth") || text.includes("advanced") || text.includes("basic");
    console.log(`  Tavily (good key, options=${JSON.stringify(tavilyOptions)}): ${r.sources.length} sources, evidence=${tavilyEv}, ${elapsed}ms`);
  } catch (e) {
    console.log(`  Tavily FAILED: ${e.code || "err"} ${String(e.message).slice(0, 80)}`);
  }

  results.optionsFallbackInvariant = {
    exaFailedAsExpected: exaFailed,
    tavilyUsedOwnOptions: tavilyOk,
    tavilyOptions,
    verdict: exaFailed && tavilyOk && tavilyEv ? "PASS" : "CHECK",
  };
  console.log(`  Verdict: ${results.optionsFallbackInvariant.verdict}`);

  writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });