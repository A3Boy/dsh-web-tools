/**
 * P5 — Profile A/B: compare provider native option profiles on the same tasks.
 * Same query, same maxResults, same key, different option profiles.
 */
"use strict";
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "..", "..");
const REPORTS = join(__dirname);
const CREDENTIALS = join(process.env.HOME || process.env.USERPROFILE, ".dsh", ".credentials.yaml");
const AB_CSV = join(REPORTS, "profile-ab.csv");

function loadCredentials() {
  const raw = readFileSync(CREDENTIALS, "utf8");
  const map = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const c = t.indexOf(":");
    if (c < 1) continue;
    const key = t.slice(0, c).trim();
    let value = t.slice(c + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key.startsWith("WEB_TOOLS_")) map[key.slice(10).toLowerCase()] = value;
  }
  return map;
}

const ADAPTERS = {
  exa: require(join(ROOT, "lib", "host", "providers", "exa.js")).ExaProvider,
  tavily: require(join(ROOT, "lib", "host", "providers", "tavily.js")).TavilyProvider,
  brave: require(join(ROOT, "lib", "host", "providers", "brave.js")).BraveProvider,
  you: require(join(ROOT, "lib", "host", "providers", "you.js")).YouProvider,
  parallel: require(join(ROOT, "lib", "host", "providers", "parallel.js")).ParallelProvider,
};

function keyOf(creds, provider) {
  return (creds[provider] || "").split(",").map((k) => k.trim()).filter(Boolean)[0] || "";
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms))]);
}

// Minimal score: answer indicator present in snippet/title?
function hasEvidence(task, sources) {
  const text = sources.map((s) => `${s.title || ""} ${s.snippet || ""}`.toLowerCase()).join(" ");
  return (task.indicators || []).some((i) => text.includes(i.toLowerCase()));
}

function officialHit(sources) {
  const domains = ["github.com/deepseek-ai", "github.com/A3Boy", "docs.exa.ai", "docs.tavily.com", "api-dashboard.search.brave.com", "docs.firecrawl.dev", "docs.parallel.ai", "ydc-index.io", "jina.ai", "sqlite.org", "developer.mozilla.org", "rfc-editor.org", "tools.ietf.org", "nodejs.org"];
  return sources.some((s) => domains.some((d) => (s.url || "").includes(d)));
}

// Tasks to test A/B on — mix of code/gh/fresh/research/web
const TASKS = [
  { id: "ab-code-04", q: "Tavily Search API 当前 search_depth 支持哪些值？", indicators: ["search_depth", "advanced", "basic"] },
  { id: "ab-code-03", q: "Exa Search API 当前支持哪些 search type？", indicators: ["search type", "instant", "deep", "neural"] },
  { id: "ab-code-05", q: "Parallel Search API 当前正式 mode 是什么？", indicators: ["advanced", "basic", "mode"] },
  { id: "ab-code-01", q: "DeepSeek Harness 当前 web_search 的多 query 参数名是什么？", indicators: ["queries"] },
  { id: "ab-gh-01", q: "DeepSeek Harness 支持 bounded multi-query web search 的官方 PR 是哪个？", indicators: ["pull", "web_search"] },
  { id: "ab-fresh-01", q: "Tavily 当前 search_depth 模式有哪些？", indicators: ["search_depth", "advanced"] },
  { id: "ab-web-01", q: "SQLite WAL 模式解决什么问题？", indicators: ["wal", "write-ahead"] },
  { id: "ab-web-02", q: "HTTP 429 Retry-After header 的作用是什么？", indicators: ["retry-after", "429"] },
  { id: "ab-docs-01", q: "Brave LLM Context API 是给什么场景使用的？", indicators: ["llm", "context"] },
  { id: "ab-research-01", q: "对比 Exa 与 Tavily 对 AI Agent 搜索的官方定位和主要差异", indicators: ["exa", "tavily"] },
  { id: "ab-research-05", q: "为什么 Parallel Search 要区分 objective 和 search_queries？", indicators: ["objective", "search_queries"] },
  { id: "ab-research-02", q: "比较 Brave LLM Context 与传统 Web Search 在 Agent grounding 上的差异", indicators: ["grounding", "llm context"] },
];

// Profile definitions
const PROFILES = {
  exa: [
    { name: "auto", options: { searchType: "auto" } },
    { name: "fast", options: { searchType: "fast" } },
    { name: "deep", options: { searchType: "deep" } },
  ],
  tavily: [
    { name: "basic", options: { searchDepth: "basic" } },
    { name: "advanced", options: { searchDepth: "advanced" } },
    { name: "fast", options: { searchDepth: "fast" } },
  ],
  brave: [
    { name: "auto", options: { endpointPreference: "auto" } },
    { name: "web-search", options: { endpointPreference: "web-search" } },
  ],
  you: [
    { name: "highlights", options: { extractionMode: "highlights" } },
    { name: "none", options: { extractionMode: "none" } },
  ],
  parallel: [
    { name: "advanced", options: { mode: "advanced" } },
    { name: "basic", options: { mode: "basic" } },
  ],
};

async function main() {
  const creds = loadCredentials();
  const rows = [];

  for (const provider of Object.keys(PROFILES)) {
    const adapter = ADAPTERS[provider];
    const key = keyOf(creds, provider);
    if (!key) { console.log(`SKIP ${provider}: no key`); continue; }
    for (const profile of PROFILES[provider]) {
      for (const task of TASKS) {
        // Use task subset relevant to provider (all tasks for simplicity)
        const started = Date.now();
        let ok = false, evidence = false, official = false, empty = true, error = null;
        let nSources = 0;
        try {
          const r = await withTimeout(adapter.search(task.q, 8, key, undefined, { options: profile.options }), 20000);
          ok = true;
          nSources = (r.sources || []).length;
          empty = nSources === 0;
          evidence = hasEvidence(task, r.sources || []);
          official = officialHit(r.sources || []);
        } catch (e) {
          error = `${e.code || "err"}:${String(e.message).slice(0, 80)}`;
        }
        const elapsed = Date.now() - started;
        rows.push({ provider, profile: profile.name, task: task.id, ok, evidence, official, empty, error, elapsedMs: elapsed, sources: nSources });
        console.log(`${provider}/${profile.name} ${task.id}: ok=${ok} ev=${evidence} off=${official} empty=${empty} ${elapsed}ms ${error || ""}`);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // CSV output
  let csv = "provider,profile,task,ok,evidence,official,empty,elapsed_ms,sources,error\n";
  for (const r of rows) csv += `${r.provider},${r.profile},${r.task},${r.ok},${r.evidence},${r.official},${r.empty},${r.elapsedMs},${r.sources},"${r.error || ""}"\n`;
  writeFileSync(AB_CSV, csv);
  console.log(`\nWrote ${AB_CSV}`);

  // Summary per provider/profile
  const by = {};
  for (const r of rows) {
    const k = `${r.provider}/${r.profile}`;
    if (!by[k]) by[k] = { provider: r.provider, profile: r.profile, total: 0, ok: 0, evidence: 0, official: 0, empty: 0, latency: [] };
    const b = by[k]; b.total++; if (r.ok) b.ok++; if (r.evidence) b.evidence++; if (r.official) b.official++; if (r.empty) b.empty++; b.latency.push(r.elapsedMs);
  }
  console.log("\n=== A/B summary ===");
  for (const [k, b] of Object.entries(by)) {
    const med = b.latency.sort((a, z) => a - z)[Math.floor(b.latency.length / 2)];
    console.log(`${b.provider} ${b.profile}: evidence=${(b.evidence/b.total*100).toFixed(0)}% official=${(b.official/b.total*100).toFixed(0)}% empty=${(b.empty/b.total*100).toFixed(0)}% median=${med}ms`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });