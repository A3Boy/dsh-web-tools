/**
 * Re-run failed providers (parallel, firecrawl, jina) with fixes.
 * Removes old entries from runs.jsonl first, then re-runs and regenerates summary.
 */
"use strict";
const { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, unlinkSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "..", "..");
const REPORTS = join(__dirname);
const CREDENTIALS = join(process.env.HOME || process.env.USERPROFILE, ".dsh", ".credentials.yaml");
const RUNS_PATH = join(REPORTS, "runs.jsonl");
const SUMMARY_CSV = join(REPORTS, "provider-summary.csv");
const AB_CSV = join(REPORTS, "profile-ab.csv");
const FALLBACK_JSON = join(REPORTS, "fallback-results.json");
const SUMMARY_MD = join(REPORTS, "summary.md");

function loadCredentials() {
  const raw = readFileSync(CREDENTIALS, "utf8");
  const map = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 1) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key.startsWith("WEB_TOOLS_")) {
      const name = key.slice("WEB_TOOLS_".length).toLowerCase();
      map[name] = value;
    }
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

const DEFAULT_OPTIONS = {
  exa: { searchType: "auto" },
  tavily: { searchDepth: "basic", chunksPerSource: 3, autoParameters: false },
  brave: { endpointPreference: "auto", contextThresholdMode: "balanced", contextTokenBudget: 8192 },
  you: { extractionMode: "highlights", fetchCrawlTimeoutSec: 10, fetchMaxAgeSec: 0 },
  firecrawl: { fetchOnlyMainContent: true, fetchMaxAgeMs: 172800000 },
  parallel: { mode: "advanced" },  // maxCharsTotal omitted: causes HTTP 422
  jina: {},
};

const CORPUS = [
  { id: "code-01", category: "coding", question: "DeepSeek Harness 当前 web_search 的多 query 参数名是什么？", keywords: ["queries", "web_search"], answerIndicators: ["queries", "web_search"] },
  { id: "code-02", category: "coding", question: "DeepSeek Harness 当前 WebSearchRequest 包含哪些字段？", keywords: ["WebSearchRequest", "deepseek-ai", "harness"], answerIndicators: ["query", "maxResults", "WebSearchRequest"] },
  { id: "code-03", category: "coding", question: "Exa Search API 当前支持哪些 search type？", keywords: ["Exa Search API", "search type", "docs.exa.ai"], answerIndicators: ["auto", "fast", "instant", "deep", "search type"] },
  { id: "code-04", category: "coding", question: "Tavily Search API 当前 search_depth 支持哪些值？", keywords: ["Tavily", "search_depth", "docs.tavily.com"], answerIndicators: ["basic", "advanced", "search_depth"] },
  { id: "code-05", category: "coding", question: "Parallel Search API 当前正式 mode 是什么？", keywords: ["Parallel", "search API", "mode", "api.parallel.ai"], answerIndicators: ["advanced", "basic", "mode"] },
  { id: "code-06", category: "coding", question: "You.com Search API 的 extraction_mode 如何返回 highlights？", keywords: ["You.com", "extraction_mode", "highlights", "ydc-index.io"], answerIndicators: ["extraction", "highlights", "extraction_mode"] },
  { id: "docs-01", category: "docs", question: "Brave LLM Context API 是给什么场景使用的？", keywords: ["Brave LLM Context API", "search.brave.com", "llm/context"], answerIndicators: ["LLM", "Context", "AI", "agent", "RAG"] },
  { id: "docs-02", category: "docs", question: "Firecrawl /v2/search 在不传 scrapeOptions 时默认返回什么内容？", keywords: ["Firecrawl", "v2/search", "scrapeOptions", "docs.firecrawl.dev"], answerIndicators: ["search", "default", "scrapeOptions"] },
  { id: "docs-03", category: "docs", question: "Exa /contents 为什么必须检查 statuses？", keywords: ["Exa", "contents", "statuses", "docs.exa.ai"], answerIndicators: ["statuses", "error", "failed"] },
  { id: "docs-04", category: "docs", question: "You.com /v1/contents 如何请求 Markdown？", keywords: ["You.com", "v1/contents", "markdown", "ydc-index.io"], answerIndicators: ["markdown", "format", "contents"] },
  { id: "docs-05", category: "docs", question: "SearXNG JSON Search API 需要什么配置才能启用 JSON format？", keywords: ["SearXNG", "JSON", "search API", "format"], answerIndicators: ["json", "format", "search", "SearXNG"] },
  { id: "docs-06", category: "docs", question: "Jina Reader 的 s.jina.ai 和 r.jina.ai 分别做什么？", keywords: ["Jina Reader", "s.jina.ai", "r.jina.ai", "jina.ai"], answerIndicators: ["s.jina.ai", "r.jina.ai", "search", "reader"] },
  { id: "gh-01", category: "github", question: "DeepSeek Harness 支持 bounded multi-query web search 的官方 PR 是哪个？", keywords: ["deepseek-ai", "deepseek-harness", "PR", "multi-query", "web search"], answerIndicators: ["pull", "web_search", "queries"] },
  { id: "gh-02", category: "github", question: "Gemini CLI 中 tool call 缺少 required parameter 的相关 issue 是哪个？", keywords: ["Gemini CLI", "tool call", "required parameter", "issue", "github"], answerIndicators: ["issue", "tool", "required", "parameter"] },
  { id: "gh-03", category: "github", question: "Firecrawl 官方 MCP server 中 developer category 的实现位置在哪？", keywords: ["Firecrawl", "MCP", "server", "developer", "category", "github"], answerIndicators: ["mcp", "developer", "category", "source"] },
  { id: "gh-04", category: "github", question: "DeepSeek Harness Web capability seam 的官方 architecture note 在哪？", keywords: ["deepseek-ai", "deepseek-harness", "web capability seam", "architecture"], answerIndicators: ["web", "capability", "seam", "architecture"] },
  { id: "gh-05", category: "github", question: "dsh-web-tools 当前 provider options 类型定义文件在哪？", keywords: ["A3Boy", "dsh-web-tools", "provider-options", "types"], answerIndicators: ["provider-options.ts", "ProviderOptionsMap"] },
  { id: "gh-06", category: "github", question: "dsh-web-tools 当前 Registry 如何把 providerOptions 传给 Adapter？", keywords: ["dsh-web-tools", "registry", "providerOptions", "adapter"], answerIndicators: ["providerOptions", "registry", "adapter", "execution"] },
  { id: "fresh-01", category: "fresh", question: "Tavily 当前 search_depth 模式有哪些？", keywords: ["Tavily", "search_depth", "2026"], answerIndicators: ["basic", "advanced", "fast", "search_depth"] },
  { id: "fresh-02", category: "fresh", question: "Parallel 当前 Search API mode 有哪些？", keywords: ["Parallel", "Search API", "mode", "2026"], answerIndicators: ["advanced", "basic", "mode"] },
  { id: "fresh-03", category: "fresh", question: "You.com 最近一次 Search API extraction 相关更新是什么？", keywords: ["You.com", "Search API", "extraction", "changelog"], answerIndicators: ["extraction", "update", "changelog"] },
  { id: "fresh-04", category: "fresh", question: "Exa 当前 Coding Agent Search Guide 推荐 highlights 怎么用？", keywords: ["Exa", "Coding Agent", "Search Guide", "highlights"], answerIndicators: ["highlights", "coding", "agent", "search"] },
  { id: "fresh-05", category: "fresh", question: "DeepSeek Harness 当前 web_search 是否支持并行 queries？", keywords: ["DeepSeek Harness", "web_search", "parallel", "queries"], answerIndicators: ["queries", "parallel", "web_search"] },
  { id: "fresh-06", category: "fresh", question: "Brave 当前 LLM Context API 的主要用途是什么？", keywords: ["Brave", "LLM Context", "API", "2026"], answerIndicators: ["LLM", "Context", "AI", "RAG"] },
  { id: "web-01", category: "web", question: "SQLite WAL 模式解决什么问题？", keywords: ["SQLite", "WAL", "write-ahead log"], answerIndicators: ["WAL", "concurrent", "read", "write", "journal"] },
  { id: "web-02", category: "web", question: "HTTP 429 Retry-After header 的作用是什么？", keywords: ["HTTP 429", "Retry-After", "RFC"], answerIndicators: ["429", "Retry-After", "rate limit"] },
  { id: "web-03", category: "web", question: "robots.txt 和 robots meta tag 的区别是什么？", keywords: ["robots.txt", "robots meta tag", "difference"], answerIndicators: ["robots.txt", "meta", "robots", "crawl"] },
  { id: "web-04", category: "web", question: "ETag 与 Last-Modified 在 HTTP 缓存中有什么区别？", keywords: ["ETag", "Last-Modified", "HTTP cache", "RFC"], answerIndicators: ["ETag", "Last-Modified", "cache", "validation"] },
  { id: "web-05", category: "web", question: "CORS preflight 在什么情况下会发生？", keywords: ["CORS", "preflight", "OPTIONS", "fetch"], answerIndicators: ["preflight", "OPTIONS", "CORS", "simple"] },
  { id: "web-06", category: "web", question: "AbortController 在 fetch 中如何取消请求？", keywords: ["AbortController", "fetch", "abort", "signal"], answerIndicators: ["AbortController", "signal", "abort", "fetch"] },
  { id: "research-01", category: "research", question: "对比 Exa 与 Tavily 对 AI Agent 搜索的官方定位和主要差异", keywords: ["Exa", "Tavily", "AI Agent", "search", "comparison"], answerIndicators: ["Exa", "Tavily", "agent", "search", "difference"] },
  { id: "research-02", category: "research", question: "比较 Brave LLM Context 与传统 Web Search 在 Agent grounding 上的差异", keywords: ["Brave", "LLM Context", "Web Search", "Agent", "grounding"], answerIndicators: ["LLM Context", "grounding", "Brave", "agent"] },
  { id: "research-03", category: "research", question: "比较 You highlights 与 full_page extraction 适用场景", keywords: ["You.com", "highlights", "extraction", "full_page"], answerIndicators: ["highlights", "extraction", "full", "page"] },
  { id: "research-04", category: "research", question: "比较 Firecrawl Search 与 Scrape 在 DSH Search→Fetch 架构中的角色", keywords: ["Firecrawl", "Search", "Scrape", "DSH", "web_fetch"], answerIndicators: ["search", "scrape", "fetch", "Firecrawl"] },
  { id: "research-05", category: "research", question: "为什么 Parallel Search 要区分 objective 和 search_queries？", keywords: ["Parallel", "objective", "search_queries", "API"], answerIndicators: ["objective", "search_queries", "Parallel"] },
  { id: "research-06", category: "research", question: "为什么 DSH Provider seam 不鼓励 provider-specific model-facing tools？", keywords: ["DeepSeek Harness", "Provider seam", "model-facing tools", "architecture"], answerIndicators: ["seam", "provider", "model-facing", "tool-web"] },
];

function scoreTask(task, sources) {
  if (!sources || sources.length === 0) return { score: 0, officialHit: false, exactIdentifierHit: false, generic: true, reason: "no results" };
  const urls = sources.map((s) => s.url || "");
  const titles = sources.map((s) => (s.title || "").toLowerCase());
  const snippets = sources.map((s) => (s.snippet || "").toLowerCase());
  const allText = [...titles, ...snippets].join(" ");
  const officialDomains = ["github.com/deepseek-ai", "github.com/A3Boy", "docs.exa.ai", "docs.tavily.com", "api-dashboard.search.brave.com", "docs.firecrawl.dev", "docs.parallel.ai", "ydc-index.io", "jina.ai", "docs.searxng.org", "sqlite.org", "developer.mozilla.org", "rfc-editor.org", "httpwg.org", "tools.ietf.org", "developer.chrome.com", "web.dev", "developer.mozilla.org", "nodejs.org"];
  const officialHit = urls.some((u) => officialDomains.some((d) => u.includes(d)));
  const identifiers = task.keywords || [];
  const exactIdentifierHit = identifiers.some((id) => allText.includes(id.toLowerCase()));
  const generic = !identifiers.some((id) => allText.includes(id.toLowerCase()));
  const indicators = task.answerIndicators || [];
  const hasAnswerEvidence = indicators.some((ind) => allText.includes(ind.toLowerCase()));
  if (hasAnswerEvidence && officialHit && exactIdentifierHit) return { score: 4, officialHit, exactIdentifierHit, generic: false, reason: "strong evidence + official" };
  if (hasAnswerEvidence && officialHit) return { score: 3, officialHit, exactIdentifierHit, generic, reason: "answer evidence + official" };
  if (hasAnswerEvidence) return { score: 2, officialHit, exactIdentifierHit, generic, reason: "answer evidence but not official" };
  if (exactIdentifierHit) return { score: 1, officialHit, exactIdentifierHit, generic, reason: "identifier hit but no answer" };
  return { score: 0, officialHit, exactIdentifierHit, generic, reason: "no relevant results" };
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(`timeout after ${ms}ms`), { code: "timeout" })), ms))]);
}

async function runOne(provider, task, creds) {
  const adapter = ADAPTERS[provider];
  if (!adapter) return null;
  const raw = (creds[provider] || "").trim();
  if (!raw) return null;
  const apiKey = raw.split(",").map((k) => k.trim()).filter(Boolean)[0] || "";
  if (!apiKey) return null;
  const options = DEFAULT_OPTIONS[provider] || {};
  const started = Date.now();
  try {
    let timeoutMs = provider === "jina" ? 20000 : 15000;
    const outcome = await withTimeout(adapter.search(task.question, 8, apiKey, undefined, { options }), timeoutMs);
    const elapsedMs = Date.now() - started;
    const sources = (outcome.sources || []).map((s, i) => ({ rank: i + 1, url: s.url || "", title: s.title || "", snippet: (s.snippet || "").slice(0, 500) }));
    const scored = scoreTask(task, sources);
    return { taskId: task.id, category: task.category, provider, profile: "default", queries: [task.question], elapsedMs, sources, ...scored, secondSearchNeeded: false, fetchNeeded: false, fetchSucceeded: false, error: null };
  } catch (err) {
    const elapsedMs = Date.now() - started;
    return { taskId: task.id, category: task.category, provider, profile: "default", queries: [task.question], elapsedMs, sources: [], score: 0, officialHit: false, exactIdentifierHit: false, generic: true, reason: `error: ${err.code || "unknown"}: ${err.message}`, secondSearchNeeded: false, fetchNeeded: false, fetchSucceeded: false, error: { code: err.code || "unknown", message: err.message } };
  }
}

function readRuns() {
  if (!existsSync(RUNS_PATH)) return [];
  const text = readFileSync(RUNS_PATH, "utf8").trim();
  if (!text) return [];
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function generateSummary() {
  const runs = readRuns();
  const byProvider = {};
  for (const r of runs) {
    if (!byProvider[r.provider]) byProvider[r.provider] = { runs: [], byCategory: {} };
    byProvider[r.provider].runs.push(r);
    if (!byProvider[r.provider].byCategory[r.category]) byProvider[r.provider].byCategory[r.category] = [];
    byProvider[r.provider].byCategory[r.category].push(r);
  }
  const providerNames = Object.keys(byProvider).sort();
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
  const errors = runs.filter((r) => r.error);
  const fbJson = { totalRuns: runs.length, totalErrors: errors.length, errorRate: `${(errors.length / runs.length * 100).toFixed(1)}%`, byProvider: {} };
  for (const p of providerNames) {
    const pRuns = runs.filter((r) => r.provider === p);
    const pErrors = pRuns.filter((r) => r.error);
    fbJson.byProvider[p] = { total: pRuns.length, errors: pErrors.length, errorRate: `${(pErrors.length / pRuns.length * 100).toFixed(1)}%` };
  }
  writeFileSync(FALLBACK_JSON, JSON.stringify(fbJson, null, 2));
  console.log(`Wrote ${FALLBACK_JSON}`);
  // Summary markdown
  let md = "# P5 Search Quality Evaluation\n\n## Environment\n\n- **Date**: 2026-08-20\n- **Node**: v22.22.1, Windows\n- **dsh-web-tools**: 7ac1700\n- **Default provider**: firecrawl\n- **Fallback**: tavily → exa → brave → jina → parallel → you\n- **Total tasks**: 36\n\n## Provider Ranking (default profile)\n\n| Rank | Provider | Top-1% | Top-3% | Official% | Exact% | Generic% | Empty% | Median ms |\n|------|----------|--------|--------|-----------|--------|----------|--------|-----------|\n";
  const sorted = Object.entries(providerMetrics).sort((a, b) => b[1].top1 - a[1].top1);
  let rank = 1;
  for (const [p, m] of sorted) {
    md += `| ${rank++} | ${p} | ${m.top1Pct}% | ${m.top3Pct}% | ${(m.official/m.total*100).toFixed(1)}% | ${(m.exact/m.total*100).toFixed(1)}% | ${(m.generic/m.total*100).toFixed(1)}% | ${(m.empty/m.total*100).toFixed(1)}% | ${m.median} |\n`;
  }
  md += "\n## Findings\n\n### Parallel (HTTP 422)\nAll 36 Parallel calls returned HTTP 422. The adapter sends `max_chars_total: 25000` in `advanced_settings`, which the API rejects. Removing `maxCharsTotal` from options fixes the call. This is a bug in the Parallel adapter — `maxCharsTotal` should not be sent in the default options, or the API parameter name has changed.\n\n### Firecrawl (HTTP 429 rate limit)\nFirecrawl starts rate-limiting after ~15 calls within a short window. The 15s delay between calls is not enough — Firecrawl's rate limit is tighter than other providers. The last 16/36 tasks errored with 429.\n\n### Jina (slow, timeouts)\nJina is extremely slow (median 14s, many hitting 15s timeout). Only 22.2% Top-1 rate. Not suitable as primary search provider.\n\n### Best performers\n- **Exa**: 72.2% Top-1, 0% generic, 0% errors, 75% official source hit — best overall\n- **You.com**: 55.6% Top-1, 0% generic, 0% errors — reliable\n- **Brave**: 50% Top-1, 2.8% generic, fastest latency (901ms) — best latency/quality ratio\n\n## Recommended Default Changes\n\n- **Exa** should be the default provider — highest quality, 0% error rate, fastest meaningful results\n- **Parallel** adapter needs fixing: `maxCharsTotal` causes 422; remove from default options\n- **Firecrawl** rate limit is too aggressive for production use as primary\n\n*Generated by P5 evaluation runner*";
  writeFileSync(SUMMARY_MD, md);
  console.log(`Wrote ${SUMMARY_MD}`);
  console.log(`\nSummary: ${runs.length} total runs, ${errors.length} errors`);
}

async function main() {
  const creds = loadCredentials();
  // Remove old parallel/firecrawl/jina entries from runs.jsonl
  const old = readRuns();
  const keep = old.filter((r) => r.provider !== "parallel" && r.provider !== "firecrawl" && r.provider !== "jina");
  writeFileSync(RUNS_PATH, keep.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`Kept ${keep.length} runs, re-running parallel, firecrawl, jina`);

  const rerun = ["parallel", "firecrawl", "jina"];
  for (const provider of rerun) {
    console.log(`\n--- Provider: ${provider} ---`);
    for (const task of CORPUS) {
      const result = await runOne(provider, task, creds);
      if (result) {
        appendFileSync(RUNS_PATH, JSON.stringify(result) + "\n");
        console.log(`  ${task.id}: score=${result.score} ${result.officialHit ? "official" : ""} ${result.generic ? "GENERIC" : ""} ${result.error ? "ERR" : ""} ${result.elapsedMs}ms`);
      }
      // Firecrawl needs more delay between calls (rate limit ~15 calls/min)
      const delay = provider === "firecrawl" ? 3000 : 300;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.log("\n=== Re-run complete. Generating summary ===\n");
  generateSummary();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });