/**
 * P5.2 — Parallel mode A/B: advanced / basic / fast / turbo on 12 tasks.
 * Same query, same key, same window; only mode differs.
 */
"use strict";
const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "..", "..");
const REPORTS = join(__dirname);
const CREDENTIALS = join(process.env.HOME || process.env.USERPROFILE, ".dsh", ".credentials.yaml");
const OUT = join(REPORTS, "parallel-modes.csv");

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

const parallel = require(join(ROOT, "lib", "host", "providers", "parallel.js")).ParallelProvider;
const key = (loadCredentials()["parallel"] || "").split(",")[0].trim();

const MODES = ["advanced", "basic", "fast", "turbo"];

const TASKS = [
  { id: "p-code-01", q: "Parallel Search API current search modes", indicators: ["mode", "advanced", "basic"] },
  { id: "p-code-04", q: "Tavily search_depth supported values", indicators: ["search_depth", "advanced", "basic"] },
  { id: "p-code-05", q: "Parallel /v1/search max_chars_total field", indicators: ["max_chars_total", "top-level"] },
  { id: "p-docs-01", q: "Brave LLM Context API use case", indicators: ["llm", "context", "agent"] },
  { id: "p-docs-06", q: "Jina Reader s.jina.ai vs r.jina.ai", indicators: ["s.jina.ai", "r.jina.ai"] },
  { id: "p-fresh-01", q: "SQLite WAL mode solves what problem", indicators: ["wal", "write-ahead"] },
  { id: "p-fresh-02", q: "HTTP 429 Retry-After header purpose", indicators: ["retry-after", "429"] },
  { id: "p-gh-01", q: "deepseek-ai deepseek-harness web_search queries parameter", indicators: ["queries", "web_search"] },
  { id: "p-gh-03", q: "Firecrawl MCP developer category implementation", indicators: ["mcp", "developer"] },
  { id: "p-web-01", q: "robots.txt vs robots meta tag difference", indicators: ["robots.txt", "meta"] },
  { id: "p-research-01", q: "Exa vs Tavily AI agent search positioning", indicators: ["exa", "tavily", "agent"] },
  { id: "p-research-05", q: "Parallel objective vs search_queries purpose", indicators: ["objective", "search_queries"] },
];

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms))]);
}

function score(sources, indicators) {
  const text = (sources || []).map((s) => `${s.title || ""} ${s.snippet || ""}`.toLowerCase()).join(" ");
  let found = 0;
  for (const i of indicators) { if (text.includes(i.toLowerCase())) found++; }
  const officialDomains = ["docs.parallel.ai", "docs.tavily.com", "docs.exa.ai", "github.com", "docs.firecrawl.dev", "jina.ai", "sqlite.org", "developer.mozilla.org", "tools.ietf.org"];
  const official = (sources || []).some((s) => officialDomains.some((d) => (s.url || "").includes(d)));
  return { found, total: indicators.length, official, uniqueUrls: new Set((sources || []).map((s) => s.url)).size };
}

async function main() {
  if (!key) { console.error("no parallel key"); process.exit(1); }
  const rows = [];
  for (const mode of MODES) {
    console.log(`\n=== mode: ${mode} ===`);
    for (const task of TASKS) {
      const started = Date.now();
      let ok = false, err = null;
      let sources = [];
      try {
        const r = await withTimeout(parallel.search(task.q, 8, key, undefined, { options: { mode } }), 20000);
        ok = true;
        sources = r.sources || [];
      } catch (e) {
        err = `${e.code || "err"}:${String(e.message).slice(0, 70)}`;
      }
      const elapsed = Date.now() - started;
      const s = score(sources, task.indicators);
      rows.push({ mode, task: task.id, ok, err, elapsedMs: elapsed, evidence: s.found, total: s.total, official: s.official, urls: s.uniqueUrls, src: sources.length });
      console.log(`  ${task.id}: ok=${ok} ev=${s.found}/${s.total} off=${s.official} ${elapsed}ms ${err || ""}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  let csv = "mode,task,ok,evidence,total,official,urls,sources,elapsed_ms,error\n";
  for (const r of rows) csv += `${r.mode},${r.task},${r.ok},${r.evidence},${r.total},${r.official},${r.urls},${r.src},${r.elapsedMs},"${r.err || ""}"\n`;
  writeFileSync(OUT, csv);
  console.log(`\nWrote ${OUT}`);

  // Summary
  console.log("\n=== Summary ===");
  for (const mode of MODES) {
    const rs = rows.filter((r) => r.mode === mode);
    const evTot = rs.reduce((a, r) => a + r.evidence, 0);
    const evMax = rs.reduce((a, r) => a + r.total, 0);
    const off = rs.filter((r) => r.official).length;
    const ok = rs.filter((r) => r.ok).length;
    const lat = rs.map((r) => r.elapsedMs).sort((a, b) => a - b);
    const med = lat[Math.floor(lat.length / 2)];
    const urls = rs.reduce((a, r) => a + r.urls, 0);
    console.log(`${mode}: ok=${ok}/12 evidence=${evTot}/${evMax} (${(evTot/evMax*100).toFixed(0)}%) official=${off}/12 median=${med}ms uniqueUrls=${urls}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });