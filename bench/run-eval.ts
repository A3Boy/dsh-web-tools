/**
 * dsh-web-tools — Benchmark Evaluation Runner (M4).
 *
 * Runs evaluation on the 20 benchmark cases, comparing:
 * - web_fetch (full-page baseline) vs web_read (focused reading via BM25)
 * - Measures token reduction, ground-truth answer recall, section discovery, and latency.
 *
 * @module
 */
import { BENCHMARK_CASES, type BenchmarkCase } from "./dataset.ts";
import { readPage } from "../src/host/read/pipeline.ts";
import { renderWebRead } from "../src/host/read/render.ts";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Standard token estimator:
 * CJK characters: ~1.5 chars per token
 * Latin / whitespace / punctuation: ~4 chars per token
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjkCount = 0;
  let nonCjkCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // CJK Unified Ideographs & symbols
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      cjkCount++;
    } else {
      nonCjkCount++;
    }
  }
  return Math.ceil(cjkCount / 1.5 + nonCjkCount / 4.0);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
}

export interface CaseResult {
  id: string;
  title: string;
  domain: string;
  question: string;
  fetchChars: number;
  fetchTokens: number;
  readChars: number;
  readTokens: number;
  tokenReductionPercent: number;
  factsTotal: number;
  factsRecalled: number;
  recallPercent: number;
  targetSectionFound: boolean;
  outlineSectionCount: number;
  latencyMs: number;
  sectionContinuationTest?: {
    sectionId: string;
    sectionChars: number;
    sectionRecallPercent: number;
  };
}

export interface BenchmarkReport {
  timestamp: string;
  totalCases: number;
  avgTokenReductionPercent: number;
  overallRecallPercent: number;
  targetSectionHitRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalFetchTokens: number;
  totalReadTokens: number;
  cases: CaseResult[];
}

export function evaluateCase(c: BenchmarkCase): CaseResult {
  const fetchChars = c.content.length;
  const fetchTokens = estimateTokens(c.content);

  const start = performance.now();
  const readRes = readPage(c.content, { focus: c.question, maxChars: 6000 });
  const rendered = renderWebRead({
    url: "https://example.com/test-article",
    focus: c.question,
    result: readRes,
  });
  const durationMs = performance.now() - start;

  const readChars = rendered.length;
  const readTokens = estimateTokens(rendered);
  const tokenReductionPercent = Math.round((1 - readTokens / fetchTokens) * 1000) / 10;

  // Verify ground truth facts recall in rendered text
  const renderedNorm = normalize(rendered);
  let factsRecalled = 0;
  for (const fact of c.groundTruth) {
    if (renderedNorm.includes(normalize(fact))) {
      factsRecalled++;
    }
  }
  const recallPercent = Math.round((factsRecalled / c.groundTruth.length) * 100);

  // Check if target section is present in passages or outline
  const normTarget = normalize(c.targetSection);
  const targetSectionFound = readRes.passages.some((p) =>
    normalize(p.heading).includes(normTarget) || normTarget.includes(normalize(p.heading))
  ) || readRes.outline.some((o) =>
    normalize(o.heading).includes(normTarget) || normTarget.includes(normalize(o.heading))
  );

  // Test section continuation if target section exists in outline
  let sectionContinuationTest: CaseResult["sectionContinuationTest"] | undefined;
  const targetOutlineEntry = readRes.outline.find((o) =>
    normalize(o.heading).includes(normTarget) || normTarget.includes(normalize(o.heading))
  );

  if (targetOutlineEntry) {
    const secRes = readPage(c.content, {
      section: targetOutlineEntry.id,
      maxChars: 6000,
    });
    const secRendered = renderWebRead({
      url: "https://example.com/test-article",
      result: secRes,
    });
    const secNorm = normalize(secRendered);
    let secRecalled = 0;
    for (const fact of c.groundTruth) {
      if (secNorm.includes(normalize(fact))) {
        secRecalled++;
      }
    }
    sectionContinuationTest = {
      sectionId: targetOutlineEntry.id,
      sectionChars: secRendered.length,
      sectionRecallPercent: Math.round((secRecalled / c.groundTruth.length) * 100),
    };
  }

  return {
    id: c.id,
    title: c.title,
    domain: c.domain,
    question: c.question,
    fetchChars,
    fetchTokens,
    readChars,
    readTokens,
    tokenReductionPercent,
    factsTotal: c.groundTruth.length,
    factsRecalled,
    recallPercent,
    targetSectionFound,
    outlineSectionCount: readRes.outlineTotal,
    latencyMs: Math.round(durationMs * 100) / 100,
    sectionContinuationTest,
  };
}

export function runBenchmark(): BenchmarkReport {
  const results: CaseResult[] = BENCHMARK_CASES.map(evaluateCase);

  let totalFetchTokens = 0;
  let totalReadTokens = 0;
  let totalReduction = 0;
  let totalFacts = 0;
  let totalRecalled = 0;
  let targetHits = 0;
  const latencies: number[] = [];

  for (const r of results) {
    totalFetchTokens += r.fetchTokens;
    totalReadTokens += r.readTokens;
    totalReduction += r.tokenReductionPercent;
    totalFacts += r.factsTotal;
    totalRecalled += r.factsRecalled;
    if (r.targetSectionFound) targetHits++;
    latencies.push(r.latencyMs);
  }

  latencies.sort((a, b) => a - b);
  const p95Index = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95));
  const avgLatency = Math.round((latencies.reduce((sum, v) => sum + v, 0) / latencies.length) * 100) / 100;

  return {
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    avgTokenReductionPercent: Math.round((totalReduction / results.length) * 10) / 10,
    overallRecallPercent: Math.round((totalRecalled / totalFacts) * 1000) / 10,
    targetSectionHitRate: Math.round((targetHits / results.length) * 100),
    avgLatencyMs: avgLatency,
    p95LatencyMs: latencies[p95Index],
    totalFetchTokens,
    totalReadTokens,
    cases: results,
  };
}

export function generateMarkdownReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push("# web_read vs web_fetch Benchmark Evaluation Report (M4)");
  lines.push("");
  lines.push(`- **Evaluation Date**: ${report.timestamp}`);
  lines.push(`- **Total Test Cases**: ${report.totalCases}`);
  lines.push(`- **Average Token Reduction**: **${report.avgTokenReductionPercent}%**`);
  lines.push(`- **Answer Fact Recall Rate**: **${report.overallRecallPercent}%**`);
  lines.push(`- **Target Section Discovery Rate**: **${report.targetSectionHitRate}%**`);
  lines.push(`- **Average Pipeline Latency**: **${report.avgLatencyMs} ms** (P95: ${report.p95LatencyMs} ms)`);
  lines.push(`- **Aggregate Tokens**: Full Page \`${report.totalFetchTokens.toLocaleString()}\` tokens → Focused Read \`${report.totalReadTokens.toLocaleString()}\` tokens`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Detailed Benchmark Results by Test Case");
  lines.push("");
  lines.push("| Case ID | Domain | Fetch Tokens | Read Tokens | Token Reduction | Fact Recall | Target Section Found | Latency |");
  lines.push("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |");

  for (const c of report.cases) {
    const sectionStatus = c.targetSectionFound ? "Yes" : "No";
    lines.push(
      `| \`${c.id}\` | ${c.domain} | ${c.fetchTokens} | ${c.readTokens} | **${c.tokenReductionPercent}%** | ${c.factsRecalled}/${c.factsTotal} (${c.recallPercent}%) | ${sectionStatus} | ${c.latencyMs}ms |`
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Section Continuation & Progressive Reading Verification (M2)");
  lines.push("");
  lines.push("When `web_read` returns an outline, callers can follow up with `section=\"<id>\"` to read one specific section in full. The table below tests whether reading the targeted section achieves 100% recall of the ground-truth facts:");
  lines.push("");
  lines.push("| Case ID | Targeted Section | Section Characters | Section Fact Recall | Result |");
  lines.push("| :--- | :---: | :---: | :---: | :---: |");

  for (const c of report.cases) {
    if (c.sectionContinuationTest) {
      const s = c.sectionContinuationTest;
      const status = s.sectionRecallPercent === 100 ? "PASS" : "PARTIAL";
      lines.push(`| \`${c.id}\` | \`${s.sectionId}\` | ${s.sectionChars} | ${s.sectionRecallPercent}% | **${status}** |`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Analysis and Preliminary Observations");
  lines.push("");
  lines.push("> Note: These are preliminary evaluation results on a 20-case synthetic long-form dataset. Real-world end-to-end evaluation on 30+ live production web pages (20k–200k chars) is scheduled for the full M4 benchmark.");
  lines.push("");
  lines.push("1. **Token Efficiency on Synthetic Pages**: On documents exceeding budget (>6,000 chars), focused reading extracts high-scoring passages and limits prompt context, while short pages fitting within budget are returned in full without outline overhead.");
  lines.push("2. **BM25 Passage Ranking & Context Expansion**: Combining BM25 keyword matching with adjacent chunk expansion captures relevant passages and adjacent narrative context without model inference.");
  lines.push("3. **Progressive Section Reading**: The section continuation mechanism (reusing the 5-minute cached page fetch and verified by `contentId`) provides a clean path for models to inspect detailed sections without re-fetching from the network.");
  lines.push("4. **Deterministic In-Memory Latency**: The pure pipeline operates in-memory in ~2–4ms without invoking external LLMs.");

  return lines.join("\n");
}

// Execute and print if called directly
const report = runBenchmark();
const markdown = generateMarkdownReport(report);

const reportPath = path.resolve(process.cwd(), "bench", "BENCHMARK_RESULTS.md");
fs.writeFileSync(reportPath, markdown, "utf8");

console.log(`\n================================================================`);
console.log(`web_read vs web_fetch Benchmark Completed (${report.totalCases} cases)`);
console.log(`================================================================`);
console.log(`Average Token Reduction   : ${report.avgTokenReductionPercent}%`);
console.log(`Answer Fact Recall Rate   : ${report.overallRecallPercent}%`);
console.log(`Target Section Hit Rate   : ${report.targetSectionHitRate}%`);
console.log(`Average Pipeline Latency  : ${report.avgLatencyMs} ms (P95: ${report.p95LatencyMs} ms)`);
console.log(`Total Tokens Processed    : ${report.totalFetchTokens.toLocaleString()} -> ${report.totalReadTokens.toLocaleString()}`);
console.log(`Detailed Report Written to: ${reportPath}`);
console.log(`================================================================\n`);
