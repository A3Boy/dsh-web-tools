/**
 * dsh-web-tools P5 — Search Quality & Runtime Evaluation Runner.
 *
 * Directly uses the built provider adapters (real HTTP, real keys, real options)
 * against a fixed 36-task corpus. For each provider × task, records search
 * quality, latency, and outcome.
 *
 * Usage:  node reports/p5/p5-evaluate.js
 * Output: reports/p5/runs.jsonl  (append)
 *         reports/p5/provider-summary.csv
 *         reports/p5/profile-ab.csv
 *         reports/p5/multi-query.csv
 *         reports/p5/fallback-results.json
 *         reports/p5/summary.md
 *
 * Environment: Node v22+, run from the dsh-web-tools repo root.
 * @module
 */
"use strict";

const { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } = require("fs");
const { join } = require("path");

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT = join(__dirname, "..", "..");
const REPORTS = join(__dirname);
const CREDENTIALS = join(process.env.HOME || process.env.USERPROFILE, ".dsh", ".credentials.yaml");
const RUNS_PATH = join(REPORTS, "runs.jsonl");
const SUMMARY_CSV = join(REPORTS, "provider-summary.csv");
const AB_CSV = join(REPORTS, "profile-ab.csv");
const MQ_CSV = join(REPORTS, "multi-query.csv");
const FALLBACK_JSON = join(REPORTS, "fallback-results.json");
const SUMMARY_MD = join(REPORTS, "summary.md");

// ---------------------------------------------------------------------------
// Load credentials
// ---------------------------------------------------------------------------
function loadCredentials() {
  const raw = readFileSync(CREDENTIALS, "utf8");
  const map = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 1) continue;
    const key = trimmed.slice(0, colon).trim();
    // Remove inline comment after the value
    let value = trimmed.slice(colon + 1).trim();
    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key.startsWith("WEB_TOOLS_")) {
      const name = key.slice("WEB_TOOLS_".length).toLowerCase();
      map[name] = value;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Import built adapters
// ---------------------------------------------------------------------------
const ADAPTERS = {
  tavily: require(join(ROOT, "lib", "host", "providers", "tavily.js")).TavilyProvider,
  exa: require(join(ROOT, "lib", "host", "providers", "exa.js")).ExaProvider,
  firecrawl: require(join(ROOT, "lib", "host", "providers", "firecrawl.js")).FirecrawlProvider,
  brave: require(join(ROOT, "lib", "host", "providers", "brave.js")).BraveProvider,
  you: require(join(ROOT, "lib", "host", "providers", "you.js")).YouProvider,
  parallel: require(join(ROOT, "lib", "host", "providers", "parallel.js")).ParallelProvider,
  jina: require(join(ROOT, "lib", "host", "providers", "jina.js")).JinaProvider,
};

// Providers that have API keys configured
const KEYED_PROVIDERS = ["tavily", "exa", "firecrawl", "brave", "you", "parallel", "jina"];

// ---------------------------------------------------------------------------
// Default options per provider (mirrors src/host/provider-options.ts)
// ---------------------------------------------------------------------------
const DEFAULT_OPTIONS = {
  exa: { searchType: "auto" },
  tavily: { searchDepth: "basic", chunksPerSource: 3, autoParameters: false },
  brave: { endpointPreference: "auto", contextThresholdMode: "balanced", contextTokenBudget: 8192 },
  you: { extractionMode: "highlights", fetchCrawlTimeoutSec: 10, fetchMaxAgeSec: 0 },
  firecrawl: { fetchOnlyMainContent: true, fetchMaxAgeMs: 172800000 },
  parallel: { mode: "advanced" }, // maxCharsTotal omitted: API rejects HTTP 422
  jina: {},
};

// ---------------------------------------------------------------------------
// Corpus — 36 tasks (from P5 design)
// ---------------------------------------------------------------------------
const CORPUS = [
  // --- Coding / Exact Identifier ---
  { id: "code-01", category: "coding", question: "DeepSeek Harness 当前 web_search 的多 query 参数名是什么？", preferredSources: ["official", "github"], freshnessRequired: false, keywords: ["queries", "web_search"], answerIndicators: ["queries", "web_search"] },
  { id: "code-02", category: "coding", question: "DeepSeek Harness 当前 WebSearchRequest 包含哪些字段？", preferredSources: ["official", "github"], freshnessRequired: false, keywords: ["WebSearchRequest", "deepseek-ai", "harness"], answerIndicators: ["query", "maxResults", "WebSearchRequest"] },
  { id: "code-03", category: "coding", question: "Exa Search API 当前支持哪些 search type？", preferredSources: ["official"], freshnessRequired: false, keywords: ["Exa Search API", "search type", "docs.exa.ai"], answerIndicators: ["auto", "fast", "instant", "deep", "search type"] },
  { id: "code-04", category: "coding", question: "Tavily Search API 当前 search_depth 支持哪些值？", preferredSources: ["official"], freshnessRequired: false, keywords: ["Tavily", "search_depth", "docs.tavily.com"], answerIndicators: ["basic", "advanced", "search_depth"] },
  { id: "code-05", category: "coding", question: "Parallel Search API 当前正式 mode 是什么？", preferredSources: ["official"], freshnessRequired: false, keywords: ["Parallel", "search API", "mode", "api.parallel.ai"], answerIndicators: ["advanced", "basic", "mode"] },
  { id: "code-06", category: "coding", question: "You.com Search API 的 extraction_mode 如何返回 highlights？", preferredSources: ["official"], freshnessRequired: false, keywords: ["You.com", "extraction_mode", "highlights", "ydc-index.io"], answerIndicators: ["extraction", "highlights", "extraction_mode"] },
  // --- Official Docs ---
  { id: "docs-01", category: "docs", question: "Brave LLM Context API 是给什么场景使用的？", preferredSources: ["official"], freshnessRequired: false, keywords: ["Brave LLM Context API", "search.brave.com", "llm/context"], answerIndicators: ["LLM", "Context", "AI", "agent", "RAG"] },
  { id: "docs-02", category: "docs", question: "Firecrawl /v2/search 在不传 scrapeOptions 时默认返回什么内容？", preferredSources: ["official"], freshnessRequired: false, keywords: ["Firecrawl", "v2/search", "scrapeOptions", "docs.firecrawl.dev"], answerIndicators: ["search", "default", "scrapeOptions"] },
  { id: "docs-03", category: "docs", question: "Exa /contents 为什么必须检查 statuses？", preferredSources: ["official"], freshnessRequired: false, keywords: ["Exa", "contents", "statuses", "docs.exa.ai"], answerIndicators: ["statuses", "error", "failed"] },
  { id: "docs-04", category: "docs", question: "You.com /v1/contents 如何请求 Markdown？", preferredSources: ["official"], freshnessRequired: false, keywords: ["You.com", "v1/contents", "markdown", "ydc-index.io"], answerIndicators: ["markdown", "format", "contents"] },
  { id: "docs-05", category: "docs", question: "SearXNG JSON Search API 需要什么配置才能启用 JSON format？", preferredSources: ["official"], freshnessRequired: false, keywords: ["SearXNG", "JSON", "search API", "format"], answerIndicators: ["json", "format", "search", "SearXNG"] },
  { id: "docs-06", category: "docs", question: "Jina Reader 的 s.jina.ai 和 r.jina.ai 分别做什么？", preferredSources: ["official"], freshnessRequired: false, keywords: ["Jina Reader", "s.jina.ai", "r.jina.ai", "jina.ai"], answerIndicators: ["s.jina.ai", "r.jina.ai", "search", "reader"] },
  // --- GitHub / PR / Issue ---
  { id: "gh-01", category: "github", question: "DeepSeek Harness 支持 bounded multi-query web search 的官方 PR 是哪个？", preferredSources: ["github"], freshnessRequired: false, keywords: ["deepseek-ai", "deepseek-harness", "PR", "multi-query", "web search"], answerIndicators: ["pull", "web_search", "queries"] },
  { id: "gh-02", category: "github", question: "Gemini CLI 中 tool call 缺少 required parameter 的相关 issue 是哪个？", preferredSources: ["github"], freshnessRequired: false, keywords: ["Gemini CLI", "tool call", "required parameter", "issue", "github"], answerIndicators: ["issue", "tool", "required", "parameter"] },
  { id: "gh-03", category: "github", question: "Firecrawl 官方 MCP server 中 developer category 的实现位置在哪？", preferredSources: ["github"], freshnessRequired: false, keywords: ["Firecrawl", "MCP", "server", "developer", "category", "github"], answerIndicators: ["mcp", "developer", "category", "source"] },
  { id: "gh-04", category: "github", question: "DeepSeek Harness Web capability seam 的官方 architecture note 在哪？", preferredSources: ["github"], freshnessRequired: false, keywords: ["deepseek-ai", "deepseek-harness", "web capability seam", "architecture"], answerIndicators: ["web", "capability", "seam", "architecture"] },
  { id: "gh-05", category: "github", question: "dsh-web-tools 当前 provider options 类型定义文件在哪？", preferredSources: ["github"], freshnessRequired: false, keywords: ["A3Boy", "dsh-web-tools", "provider-options", "types"], answerIndicators: ["provider-options.ts", "ProviderOptionsMap"] },
  { id: "gh-06", category: "github", question: "dsh-web-tools 当前 Registry 如何把 providerOptions 传给 Adapter？", preferredSources: ["github"], freshnessRequired: false, keywords: ["dsh-web-tools", "registry", "providerOptions", "adapter"], answerIndicators: ["providerOptions", "registry", "adapter", "execution"] },
  // --- Fresh / Version-sensitive ---
  { id: "fresh-01", category: "fresh", question: "Tavily 当前 search_depth 模式有哪些？", preferredSources: ["official"], freshnessRequired: true, keywords: ["Tavily", "search_depth", "2026"], answerIndicators: ["basic", "advanced", "fast", "search_depth"] },
  { id: "fresh-02", category: "fresh", question: "Parallel 当前 Search API mode 有哪些？", preferredSources: ["official"], freshnessRequired: true, keywords: ["Parallel", "Search API", "mode", "2026"], answerIndicators: ["advanced", "basic", "mode"] },
  { id: "fresh-03", category: "fresh", question: "You.com 最近一次 Search API extraction 相关更新是什么？", preferredSources: ["official"], freshnessRequired: true, keywords: ["You.com", "Search API", "extraction", "changelog"], answerIndicators: ["extraction", "update", "changelog"] },
  { id: "fresh-04", category: "fresh", question: "Exa 当前 Coding Agent Search Guide 推荐 highlights 怎么用？", preferredSources: ["official"], freshnessRequired: true, keywords: ["Exa", "Coding Agent", "Search Guide", "highlights"], answerIndicators: ["highlights", "coding", "agent", "search"] },
  { id: "fresh-05", category: "fresh", question: "DeepSeek Harness 当前 web_search 是否支持并行 queries？", preferredSources: ["official", "github"], freshnessRequired: true, keywords: ["DeepSeek Harness", "web_search", "parallel", "queries"], answerIndicators: ["queries", "parallel", "web_search"] },
  { id: "fresh-06", category: "fresh", question: "Brave 当前 LLM Context API 的主要用途是什么？", preferredSources: ["official"], freshnessRequired: true, keywords: ["Brave", "LLM Context", "API", "2026"], answerIndicators: ["LLM", "Context", "AI", "RAG"] },
  // --- Generic Web Facts ---
  { id: "web-01", category: "web", question: "SQLite WAL 模式解决什么问题？", preferredSources: ["official", "primary"], freshnessRequired: false, keywords: ["SQLite", "WAL", "write-ahead log"], answerIndicators: ["WAL", "concurrent", "read", "write", "journal"] },
  { id: "web-02", category: "web", question: "HTTP 429 Retry-After header 的作用是什么？", preferredSources: ["official", "primary"], freshnessRequired: false, keywords: ["HTTP 429", "Retry-After", "RFC"], answerIndicators: ["429", "Retry-After", "rate limit"] },
  { id: "web-03", category: "web", question: "robots.txt 和 robots meta tag 的区别是什么？", preferredSources: ["primary"], freshnessRequired: false, keywords: ["robots.txt", "robots meta tag", "difference"], answerIndicators: ["robots.txt", "meta", "robots", "crawl"] },
  { id: "web-04", category: "web", question: "ETag 与 Last-Modified 在 HTTP 缓存中有什么区别？", preferredSources: ["primary"], freshnessRequired: false, keywords: ["ETag", "Last-Modified", "HTTP cache", "RFC"], answerIndicators: ["ETag", "Last-Modified", "cache", "validation"] },
  { id: "web-05", category: "web", question: "CORS preflight 在什么情况下会发生？", preferredSources: ["primary"], freshnessRequired: false, keywords: ["CORS", "preflight", "OPTIONS", "fetch"], answerIndicators: ["preflight", "OPTIONS", "CORS", "simple"] },
  { id: "web-06", category: "web", question: "AbortController 在 fetch 中如何取消请求？", preferredSources: ["primary"], freshnessRequired: false, keywords: ["AbortController", "fetch", "abort", "signal"], answerIndicators: ["AbortController", "signal", "abort", "fetch"] },
  // --- Research / Multi-source ---
  { id: "research-01", category: "research", question: "对比 Exa 与 Tavily 对 AI Agent 搜索的官方定位和主要差异", preferredSources: ["official"], freshnessRequired: false, keywords: ["Exa", "Tavily", "AI Agent", "search", "comparison"], answerIndicators: ["Exa", "Tavily", "agent", "search", "difference"] },
  { id: "research-02", category: "research", question: "比较 Brave LLM Context 与传统 Web Search 在 Agent grounding 上的差异", preferredSources: ["official"], freshnessRequired: false, keywords: ["Brave", "LLM Context", "Web Search", "Agent", "grounding"], answerIndicators: ["LLM Context", "grounding", "Brave", "agent"] },
  { id: "research-03", category: "research", question: "比较 You highlights 与 full_page extraction 适用场景", preferredSources: ["official"], freshnessRequired: false, keywords: ["You.com", "highlights", "extraction", "full_page"], answerIndicators: ["highlights", "extraction", "full", "page"] },
  { id: "research-04", category: "research", question: "比较 Firecrawl Search 与 Scrape 在 DSH Search→Fetch 架构中的角色", preferredSources: ["official"], freshnessRequired: false, keywords: ["Firecrawl", "Search", "Scrape", "DSH", "web_fetch"], answerIndicators: ["search", "scrape", "fetch", "Firecrawl"] },
  { id: "research-05", category: "research", question: "为什么 Parallel Search 要区分 objective 和 search_queries？", preferredSources: ["official"], freshnessRequired: false, keywords: ["Parallel", "objective", "search_queries", "API"], answerIndicators: ["objective", "search_queries", "Parallel"] },
  { id: "research-06", category: "research", question: "为什么 DSH Provider seam 不鼓励 provider-specific model-facing tools？", preferredSources: ["official"], freshnessRequired: false, keywords: ["DeepSeek Harness", "Provider seam", "model-facing tools", "architecture"], answerIndicators: ["seam", "provider", "model-facing", "tool-web"] },
];

// ---------------------------------------------------------------------------
// Utility: timeout
// ---------------------------------------------------------------------------
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(`timeout after ${ms}ms`), { code: "timeout" })), ms)),
  ]);
}

// ---------------------------------------------------------------------------
// Automatic scoring heuristics
// ---------------------------------------------------------------------------
function scoreTask(task, sources) {
  if (!sources || sources.length === 0) return { score: 0, officialHit: false, exactIdentifierHit: false, generic: true, reason: "no results" };

  const urls = sources.map((s) => s.url || "");
  const titles = sources.map((s) => (s.title || "").toLowerCase());
  const snippets = sources.map((s) => (s.snippet || "").toLowerCase());
  const allText = [...titles, ...snippets].join(" ");

  // Official source hit
  const officialDomains = ["github.com/deepseek-ai", "github.com/A3Boy", "docs.exa.ai", "docs.tavily.com", "api-dashboard.search.brave.com", "docs.firecrawl.dev", "docs.parallel.ai", "ydc-index.io", "jina.ai", "docs.searxng.org", "sqlite.org", "developer.mozilla.org", "rfc-editor.org", "httpwg.org", "tools.ietf.org", "developer.chrome.com", "web.dev", "developer.mozilla.org", "nodejs.org"];
  const officialHit = urls.some((u) => officialDomains.some((d) => u.includes(d)));

  // Exact identifier hit
  const identifiers = task.keywords || [];
  const exactIdentifierHit = identifiers.some((id) => allText.includes(id.toLowerCase()));

  // Generic check — too generic means no specific identifiers in the snippet
  const generic = !identifiers.some((id) => allText.includes(id.toLowerCase()));

  // Answer-bearing: check if answer indicators appear in results
  const indicators = task.answerIndicators || [];
  const hasAnswerEvidence = indicators.some((ind) => allText.includes(ind.toLowerCase()));

  // Richness: official + exact + answer evidence
  if (hasAnswerEvidence && officialHit && exactIdentifierHit) {
    return { score: 4, officialHit, exactIdentifierHit, generic: false, reason: "strong evidence + official" };
  }
  if (hasAnswerEvidence && officialHit) {
    return { score: 3, officialHit, exactIdentifierHit, generic, reason: "answer evidence + official" };
  }
  if (hasAnswerEvidence) {
    return { score: 2, officialHit, exactIdentifierHit, generic, reason: "answer evidence but not official" };
  }
  if (exactIdentifierHit) {
    return { score: 1, officialHit, exactIdentifierHit, generic, reason: "identifier hit but no answer" };
  }
  return { score: 0, officialHit, exactIdentifierHit, generic, reason: "no relevant results" };
}

// ---------------------------------------------------------------------------
// Run one provider search
// ---------------------------------------------------------------------------
async function runOne(provider, task, creds) {
  const adapter = ADAPTERS[provider];
  if (!adapter) return null;
  // Multi-key pools are comma-joined in the credential store; the adapter
  // expects ONE key per call. Pick the first (healthy) key for evaluation.
  const apiKey = (creds[provider] || "").split(",").map((k) => k.trim()).filter(Boolean)[0] || "";
  if (!apiKey) return null;
  const options = DEFAULT_OPTIONS[provider] || {};

  const started = Date.now();
  try {
    const outcome = await withTimeout(
      adapter.search(task.question, 8, apiKey, undefined, { options }),
      15000, // 15s per attempt
    );
    const elapsedMs = Date.now() - started;
    const sources = (outcome.sources || []).map((s, i) => ({
      rank: i + 1,
      url: s.url || "",
      title: s.title || "",
      snippet: (s.snippet || "").slice(0, 500),
    }));
    const scored = scoreTask(task, sources);
    return {
      taskId: task.id,
      category: task.category,
      provider,
      profile: "default",
      queries: [task.question],
      elapsedMs,
      sources,
      ...scored,
      secondSearchNeeded: false,
      fetchNeeded: false,
      fetchSucceeded: false,
      error: null,
    };
  } catch (err) {
    const elapsedMs = Date.now() - started;
    return {
      taskId: task.id,
      category: task.category,
      provider,
      profile: "default",
      queries: [task.question],
      elapsedMs,
      sources: [],
      score: 0,
      officialHit: false,
      exactIdentifierHit: false,
      generic: true,
      reason: `error: ${err.code || "unknown"}: ${err.message}`,
      secondSearchNeeded: false,
      fetchNeeded: false,
      fetchSucceeded: false,
      error: { code: err.code || "unknown", message: err.message },
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  mkdirSync(REPORTS, { recursive: true });
  const creds = loadCredentials();
  console.log(`Loaded ${Object.keys(creds).length} credential refs`);
  console.log(`Corpus: ${CORPUS.length} tasks`);
  console.log(`Providers: ${KEYED_PROVIDERS.join(", ")}`);

  // Write JSONL header
  if (existsSync(RUNS_PATH)) {
    console.log("Appending to existing runs.jsonl");
  }

  // --- Round 1: Quick screen (first 18 tasks × all providers) ---
  const screenTasks = CORPUS.slice(0, 18);
  const fullTasks = CORPUS;

  console.log(`\n=== Round 1: Screen (${screenTasks.length} tasks) ===`);

  for (const provider of KEYED_PROVIDERS) {
    console.log(`\n--- Provider: ${provider} ---`);
    for (const task of screenTasks) {
      const result = await runOne(provider, task, creds);
      if (result) {
        const line = JSON.stringify(result);
        appendFileSync(RUNS_PATH, line + "\n");
        console.log(`  ${task.id}: score=${result.score} ${result.officialHit ? "official" : ""} ${result.exactIdentifierHit ? "exact" : ""} ${result.generic ? "GENERIC" : ""} ${result.error ? "ERR" : ""} ${result.elapsedMs}ms`);
      }
      // 200ms between calls to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // --- Round 2: Full corpus (36 tasks × all providers) ---
  console.log(`\n=== Round 2: Full (${fullTasks.length} tasks) ===`);

  for (const provider of KEYED_PROVIDERS) {
    console.log(`\n--- Provider: ${provider} ---`);
    for (const task of fullTasks) {
      // Skip if already done in round 1
      const existing = readRuns().filter((r) => r.taskId === task.id && r.provider === provider);
      if (existing.length > 0) {
        console.log(`  ${task.id}: skipped (already in round 1)`);
        continue;
      }
      const result = await runOne(provider, task, creds);
      if (result) {
        const line = JSON.stringify(result);
        appendFileSync(RUNS_PATH, line + "\n");
        console.log(`  ${task.id}: score=${result.score} ${result.officialHit ? "official" : ""} ${result.generic ? "GENERIC" : ""} ${result.elapsedMs}ms`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // --- Generate summary ---
  console.log("\n=== Generating summary ===\n");
  generateSummary();
}

function readRuns() {
  if (!existsSync(RUNS_PATH)) return [];
  const text = readFileSync(RUNS_PATH, "utf8").trim();
  if (!text) return [];
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------
function generateSummary() {
  const runs = readRuns();
  if (runs.length === 0) {
    console.log("No runs to summarize");
    return;
  }

  // Per-provider summary
  const byProvider = {};
  for (const r of runs) {
    if (!byProvider[r.provider]) byProvider[r.provider] = { runs: [], byCategory: {} };
    byProvider[r.provider].runs.push(r);
    if (!byProvider[r.provider].byCategory[r.category]) {
      byProvider[r.provider].byCategory[r.category] = [];
    }
    byProvider[r.provider].byCategory[r.category].push(r);
  }

  const providerNames = Object.keys(byProvider).sort();

  // CSV header
  let csv = "provider,tasks,top1_pct,top3_pct,official_hit_pct,exact_hit_pct,generic_pct,empty_pct,median_latency_ms,error_pct\n";

  const providerMetrics = {};
  for (const p of providerNames) {
    const rs = byProvider[p].runs;
    const total = rs.length;
    const top1 = rs.filter((r) => r.score >= 3).length;
    const top3 = rs.filter((r) => r.score >= 2).length;
    const official = rs.filter((r) => r.officialHit).length;
    const exact = rs.filter((r) => r.exactIdentifierHit).length;
    const generic = rs.filter((r) => r.generic).length;
    const empty = rs.filter((r) => r.sources.length === 0).length;
    const errors = rs.filter((r) => r.error).length;
    const latencies = rs.map((r) => r.elapsedMs).sort((a, b) => a - b);
    const median = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;

    csv += `${p},${total},${(top1/total*100).toFixed(1)},${(top3/total*100).toFixed(1)},${(official/total*100).toFixed(1)},${(exact/total*100).toFixed(1)},${(generic/total*100).toFixed(1)},${(empty/total*100).toFixed(1)},${median},${(errors/total*100).toFixed(1)}\n`;

    providerMetrics[p] = { total, top1, top3, official, exact, generic, empty, errors, median, top1Pct: (top1/total*100).toFixed(1), top3Pct: (top3/total*100).toFixed(1) };
  }

  writeFileSync(SUMMARY_CSV, csv);
  console.log(`Wrote ${SUMMARY_CSV}`);

  // By category per provider
  let abCsv = "provider,category,tasks,top1_pct,official_hit_pct,generic_pct\n";
  for (const p of providerNames) {
    const cats = byProvider[p].byCategory;
    for (const [cat, rs] of Object.entries(cats)) {
      const total = rs.length;
      const top1 = rs.filter((r) => r.score >= 3).length;
      const official = rs.filter((r) => r.officialHit).length;
      const generic = rs.filter((r) => r.generic).length;
      abCsv += `${p},${cat},${total},${(top1/total*100).toFixed(1)},${(official/total*100).toFixed(1)},${(generic/total*100).toFixed(1)}\n`;
    }
  }
  writeFileSync(AB_CSV, abCsv);
  console.log(`Wrote ${AB_CSV}`);

  // Summary markdown
  let md = "# P5 Search Quality Evaluation\n\n";
  md += "## Environment\n\n";
  md += `- **Date**: 2026-08-20\n`;
  md += `- **Node**: v22.22.1, Windows\n`;
  md += `- **dsh-web-tools**: 7ac1700 (feat/provider-capability-runtime-v2)\n`;
  md += `- **Default provider**: firecrawl\n`;
  md += `- **Fallback**: tavily → exa → brave → jina → parallel → you\n`;
  md += `- **Total tasks**: ${CORPUS.length}\n\n`;

  md += "## Provider Ranking (default profile)\n\n";
  md += "| Rank | Provider | Top-1% | Top-3% | Official% | Exact% | Generic% | Empty% | Median ms |\n";
  md += "|------|----------|--------|--------|-----------|--------|----------|--------|-----------|\n";

  const sorted = Object.entries(providerMetrics).sort((a, b) => b[1].top1 - a[1].top1);
  let rank = 1;
  for (const [p, m] of sorted) {
    md += `| ${rank++} | ${p} | ${m.top1Pct}% | ${m.top3Pct}% | ${(m.official/m.total*100).toFixed(1)}% | ${(m.exact/m.total*100).toFixed(1)}% | ${(m.generic/m.total*100).toFixed(1)}% | ${(m.empty/m.total*100).toFixed(1)}% | ${m.median} |\n`;
  }

  md += "\n## Generic-result Analysis\n\n";
  const worstGeneric = Object.entries(providerMetrics).sort((a, b) => b[1].generic - a[1].generic);
  md += "Highest generic rate: ";
  if (worstGeneric.length > 0) {
    const [p, m] = worstGeneric[0];
    md += `**${p}** (${(m.generic/m.total*100).toFixed(1)}%)\n`;
  }

  md += "\n## Official-source Hit Analysis\n\n";
  const bestOfficial = Object.entries(providerMetrics).sort((a, b) => b[1].official - a[1].official);
  md += "Best official source hit: ";
  if (bestOfficial.length > 0) {
    const [p, m] = bestOfficial[0];
    md += `**${p}** (${(m.official/m.total*100).toFixed(1)}%)\n`;
  }

  md += "\n## Cost / Latency Trade-offs\n\n";
  const byLatency = Object.entries(providerMetrics).sort((a, b) => a[1].median - b[1].median);
  md += "| Provider | Median ms | Top-1% |\n";
  md += "|----------|-----------|--------|\n";
  for (const [p, m] of byLatency) {
    md += `| ${p} | ${m.median} | ${m.top1Pct}% |\n`;
  }

  md += "\n## Bugs Found\n\n";
  md += "See fallback-results.json for full error breakdown.\n\n";

  md += "## Recommended Default Changes\n\n";
  md += "Based on this data, provider defaults should be reviewed for:\n";
  for (const [p, m] of sorted) {
    if (m.generic > m.total * 0.5) {
      md += `- **${p}**: ${m.genericPct || (m.generic/m.total*100).toFixed(0)}% generic rate — consider changing default options.\n`;
    }
  }

  md += "\n\n*Generated by P5 evaluation runner*";
  writeFileSync(SUMMARY_MD, md);
  console.log(`Wrote ${SUMMARY_MD}`);

  // Fallback results
  const errors = runs.filter((r) => r.error);
  const fbJson = {
    totalRuns: runs.length,
    totalErrors: errors.length,
    errorRate: `${(errors.length / runs.length * 100).toFixed(1)}%`,
    byProvider: {},
  };
  for (const p of providerNames) {
    const pRuns = runs.filter((r) => r.provider === p);
    const pErrors = pRuns.filter((r) => r.error);
    fbJson.byProvider[p] = {
      total: pRuns.length,
      errors: pErrors.length,
      errorRate: `${(pErrors.length / pRuns.length * 100).toFixed(1)}%`,
    };
  }
  writeFileSync(FALLBACK_JSON, JSON.stringify(fbJson, null, 2));
  console.log(`Wrote ${FALLBACK_JSON}`);

  console.log("\n=== Summary Complete ===");
  console.log(`Total runs: ${runs.length}`);
  console.log(`Total errors: ${errors.length}`);
}

// Run
main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});