/**
 * M4 benchmark — aggregation and report rendering.
 *
 * Reports distributions (min / p25 / median / mean / p75 / max), never a single
 * cherry-picked range, and lists every failing case with the facts it missed.
 * @module
 */
import type { CaseResult } from "./evaluate.ts";
import { summarize } from "./stats.ts";
import type { Summary } from "./stats.ts";

export interface ReportMeta {
  generatedAt: string;
  command: string;
  split: string;
  budgets: number[];
  maxRounds: number;
  lockStatus: string;
  /** Case ids skipped because their fixture is missing. */
  missingFixtures: string[];
  leakageWarnings: string[];
  totalCases: number;
}

export interface BudgetAggregate {
  budget: number;
  n: number;
  recallFirstText: number | null;
  recallFinalText: number | null;
  recallFinalPassage: number | null;
  passFirstRate: number | null;
  passFinalRate: number | null;
  roundsMean: number | null;
  /** Savings of the FIRST call only (1 − firstTokens / baselineTokens). */
  savingsFirst: Summary;
  /** Savings including follow-up rounds (the honest number). */
  savingsNet: Summary;
  latencyMs: Summary;
}

const mean = (xs: number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const rate = (flags: boolean[]): number | null => (flags.length === 0 ? null : flags.filter(Boolean).length / flags.length);
const pct = (x: number | null): string => (x === null ? "–" : `${(x * 100).toFixed(1)}%`);
const num = (x: number | null, digits = 1): string => (x === null ? "–" : x.toFixed(digits));

function answerable(results: CaseResult[]): CaseResult[] {
  return results.filter((r) => r.valid && r.passedFinal !== null);
}

export function aggregate(results: CaseResult[], budget: number): BudgetAggregate {
  const rs = answerable(results.filter((r) => r.budget === budget));
  return {
    budget,
    n: rs.length,
    recallFirstText: mean(rs.map((r) => r.recallFirstText as number)),
    recallFinalText: mean(rs.map((r) => r.recallFinalText as number)),
    recallFinalPassage: mean(rs.map((r) => r.recallFinalPassage as number)),
    passFirstRate: rate(rs.map((r) => r.passedFirst as boolean)),
    passFinalRate: rate(rs.map((r) => r.passedFinal as boolean)),
    roundsMean: mean(rs.map((r) => r.rounds)),
    savingsFirst: summarize(rs.map((r) => 1 - r.firstTokens / Math.max(1, r.baselineTokens))),
    savingsNet: summarize(rs.map((r) => 1 - r.totalTokens / Math.max(1, r.baselineTokens))),
    latencyMs: summarize(rs.map((r) => r.latencyMs)),
  };
}

function summaryRow(label: string, s: Summary): string {
  return `| ${label} | ${s.n} | ${pct(s.min)} | ${pct(s.p25)} | ${pct(s.median)} | ${pct(s.mean)} | ${pct(s.p75)} | ${pct(s.max)} |`;
}

export function buildReport(results: CaseResult[], meta: ReportMeta): { markdown: string; aggregates: BudgetAggregate[] } {
  const aggregates = meta.budgets.map((b) => aggregate(results, b));
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(
    "# web_read benchmark (M4)",
    "",
    `- Generated: ${meta.generatedAt}`,
    `- Command: \`${meta.command}\``,
    `- Split: **${meta.split}** · lock: ${meta.lockStatus}`,
    `- Budgets (chars): ${meta.budgets.join(", ")} · max rounds: ${meta.maxRounds}`,
    `- Cases in file: ${meta.totalCases} · evaluated: ${new Set(results.map((r) => r.id)).size} · missing fixtures: ${meta.missingFixtures.length}`,
    "- Baseline: `web_fetch` (whole page, capped). Token counts are **estimates**; compare ratios, not absolutes.",
    "- Follow-up rounds are played by a deterministic heading-matching policy, a proxy for model behaviour.",
    "",
  );

  push(
    "## Headline",
    "",
    "| Budget | n | Recall (1st call) | Recall (final) | Pass 1st call | Pass final | Mean rounds | Net savings (median) |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const a of aggregates) {
    push(
      `| ${a.budget} | ${a.n} | ${pct(a.recallFirstText)} | ${pct(a.recallFinalText)} | ${pct(a.passFirstRate)} | ${pct(a.passFinalRate)} | ${num(a.roundsMean, 2)} | ${pct(a.savingsNet.median)} |`,
    );
  }
  push("", "_Pass = every fact's keyword set found in the returned text. Recall (passage) below is the stricter co-occurrence variant._", "");

  for (const a of aggregates) {
    push(
      `## Budget ${a.budget}`,
      "",
      `Recall (final, same-passage co-occurrence): ${pct(a.recallFinalPassage)}`,
      "",
      "| Savings vs web_fetch | n | min | p25 | median | mean | p75 | max |",
      "|---|---:|---:|---:|---:|---:|---:|---:|",
      summaryRow("first call only", a.savingsFirst),
      summaryRow("net, incl. follow-ups", a.savingsNet),
      "",
      `Latency (ms) — median ${num(a.latencyMs.median, 2)}, p75 ${num(a.latencyMs.p75, 2)}, max ${num(a.latencyMs.max, 2)}`,
      "",
    );
    const byKind = new Map<string, CaseResult[]>();
    for (const r of answerable(results.filter((x) => x.budget === a.budget))) {
      byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
    }
    if (byKind.size > 0) {
      push("| Kind | n | Pass final | Median net savings |", "|---|---:|---:|---:|");
      for (const [kind, rs] of [...byKind.entries()].sort()) {
        const net = summarize(rs.map((r) => 1 - r.totalTokens / Math.max(1, r.baselineTokens)));
        push(`| ${kind} | ${rs.length} | ${pct(rate(rs.map((r) => r.passedFinal as boolean)))} | ${pct(net.median)} |`);
      }
      push("");
    }
  }

  const failures = answerable(results).filter((r) => r.passedFinal === false);
  push("## Failures", "");
  if (failures.length === 0) push("None.", "");
  else {
    push("| Case | Kind | Budget | Missing facts | Rounds | Focus matched |", "|---|---|---:|---|---:|---|");
    for (const r of failures.sort((x, y) => x.id.localeCompare(y.id) || x.budget - y.budget)) {
      push(`| ${r.id} | ${r.kind} | ${r.budget} | ${r.missingFinal.join(", ")} | ${r.rounds} | ${r.focusMatchedFirst ? "yes" : "no"} |`);
    }
    push("", "_Read these first: each is a concrete retrieval weakness (or a bad case). Do not edit a test-split case to make it pass._", "");
  }

  const negatives = results.filter((r) => r.passedFinal === null && r.valid);
  if (negatives.length > 0) {
    push("## Unanswerable questions (negative cases)", "", "| Budget | n | Focus matched (lower is better) |", "|---:|---:|---:|");
    for (const b of meta.budgets) {
      const rs = negatives.filter((r) => r.budget === b);
      push(`| ${b} | ${rs.length} | ${pct(rate(rs.map((r) => r.focusMatchedFirst)))} |`);
    }
    push("");
  }

  const invalid = new Map<string, string>();
  for (const r of results) if (!r.valid) invalid.set(r.id, r.invalidReason ?? "invalid");
  if (invalid.size > 0) {
    push("## Invalid cases (excluded from all numbers)", "");
    for (const [id, why] of invalid) push(`- ${id}: ${why}`);
    push("");
  }
  if (meta.missingFixtures.length > 0) push("## Missing fixtures", "", ...meta.missingFixtures.map((id) => `- ${id}`), "");
  if (meta.leakageWarnings.length > 0) push("## Possible focus leakage", "", ...meta.leakageWarnings.map((w) => `- ${w}`), "");

  return { markdown: lines.join("\n"), aggregates };
}
