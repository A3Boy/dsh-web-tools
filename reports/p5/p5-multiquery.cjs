/**
 * P5 — Multi-query comparison: 1 vs 2 vs 4 queries on the same task.
 * Compares coverage gain, evidence rate, latency.
 */
"use strict";
const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "..", "..");
const REPORTS = join(__dirname);
const CREDENTIALS = join(process.env.HOME || process.env.USERPROFILE, ".dsh", ".credentials.yaml");
const MQ_CSV = join(REPORTS, "multi-query.csv");

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

// Use exa provider for multi-query (best quality)
const ADAPTERS = { exa: require(join(ROOT, "lib", "host", "providers", "exa.js")).ExaProvider };
const key = loadCredentials()["exa"].split(",")[0].trim();

// Tasks with independent unknowns (genuine multi-query candidates)
const TESTS = [
  // Type 1: Independent unknowns
  {
    label: "3-independent-unknowns",
    single: ["Exa Tavily Parallel current search modes"],
    multi2: ["Exa search types", "Tavily Parallel search modes"],
    multi4: ["Exa current Search API search types", "Tavily current search_depth values", "Parallel current Search API modes", "You.com extraction mode"],
    indicators: ["search type", "search_depth", "advanced", "basic"],
  },
  // Type 2: Different source angles
  {
    label: "provider-seam-architecture",
    single: ["DeepSeek Harness web capability seam architecture"],
    multi2: ["DeepSeek Harness web capability seam", "DeepSeek Harness tool-web provider model-facing tools"],
    multi4: ["DeepSeek Harness web capability seam architecture", "DSH tool-web provider tools", "DSH web-search-exa limitations", "DSH provider neutral search"],
    indicators: ["seam", "provider", "tool-web", "architecture"],
  },
  // Type 3: Paraphrase spam (negative test)
  {
    label: "paraphrase-spam",
    single: ["DeepSeek Harness parallel web search queries parameter"],
    multi2: ["DeepSeek Harness parallel web search", "DSH web_search queries"],
    multi4: ["DeepSeek Harness parallel web search", "DSH parallel web search", "DeepSeek Harness multi query search", "DeepSeek Harness parallel search feature"],
    indicators: ["queries", "parallel"],
  },
  // Type 4: Specific technical question
  {
    label: "exa-search-types",
    single: ["Exa Search API search types auto fast instant deep"],
    multi2: ["Exa Search API search types", "Exa deep search modes"],
    multi4: ["Exa Search API search types", "Exa deep search", "Exa neural search", "Exa keyword search"],
    indicators: ["auto", "fast", "instant", "deep"],
  },
  // Type 5: Research comparison
  {
    label: "exa-vs-tavily",
    single: ["Exa Tavily comparison AI agent search"],
    multi2: ["Exa AI agent search features", "Tavily AI agent search features"],
    multi4: ["Exa AI agent search features", "Tavily AI agent search features", "Exa neural search vs Tavily", "Best AI search API for agents"],
    indicators: ["exa", "tavily", "agent"],
  },
];

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms))]);
}

function evidenceFor(queries, sources, indicators) {
  const text = (sources || []).map((s) => `${s.title || ""} ${s.snippet || ""}`.toLowerCase()).join(" ");
  let found = 0;
  for (const ind of indicators) { if (text.includes(ind.toLowerCase())) found++; }
  return { found, total: indicators.length, urls: new Set(sources.map((s) => s.url)).size };
}

async function runQueries(queries) {
  const allSources = [];
  let totalMs = 0;
  for (const q of queries) {
    const started = Date.now();
    try {
      const r = await withTimeout(ADAPTERS.exa.search(q, 5, key, undefined, { options: { searchType: "auto" } }), 15000);
      totalMs += Date.now() - started;
      if (r.sources) allSources.push(...r.sources);
    } catch { totalMs += Date.now() - started; }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { sources: allSources, elapsedMs: totalMs };
}

async function main() {
  const rows = [];
  for (const test of TESTS) {
    console.log(`\n--- ${test.label} ---`);
    const scenarios = [
      { name: "1-query", queries: test.single },
      { name: "2-query", queries: test.multi2 },
      { name: "4-query", queries: test.multi4 },
    ];
    for (const s of scenarios) {
      const { sources, elapsedMs } = await runQueries(s.queries);
      const ev = evidenceFor(s.queries, sources, test.indicators);
      const dedupUrls = new Set(sources.map((s) => s.url)).size;
      rows.push({ label: test.label, scenario: s.name, queries: s.queries.length, elapsedMs, sources: sources.length, dedupUrls, indicatorsFound: ev.found, indicatorTotal: ev.total });
      console.log(`  ${s.name}: ${s.queries.length}q=${elapsedMs}ms, ${dedupUrls} unique URLs, indicators ${ev.found}/${ev.total}`);
    }
  }

  let csv = "label,scenario,queries,elapsed_ms,sources,dedup_urls,indicators_found,indicator_total\n";
  for (const r of rows) csv += `${r.label},${r.scenario},${r.queries},${r.elapsedMs},${r.sources},${r.dedupUrls},${r.indicatorsFound},${r.indicatorTotal}\n`;
  writeFileSync(MQ_CSV, csv);
  console.log(`\nWrote ${MQ_CSV}`);
}

main().catch((e) => { console.error(e); process.exit(1); });