/**
 * M4 benchmark — evaluate one case at one budget.
 *
 * Models a realistic web_read session:
 *   round 1: web_read(url, focus, maxChars=budget)
 *   rounds 2..N (only while facts are missing): the harness plays a simple,
 *   deterministic "model": it picks the not-yet-seen outline entry whose HEADING
 *   best matches the focus and calls web_read(section=…). This is a proxy for
 *   model behaviour, not an oracle — if headings are generic it will (like a
 *   model) pick the wrong section or give up.
 *
 * Baseline is web_fetch: the whole page, capped at DSH's fetchMaxOutputChars.
 *
 * `readPage` is injectable so the harness can be unit-tested independently of
 * the retrieval algorithm.
 * @module
 */
import { splitMarkdown } from "../../src/host/read/chunk.ts";
import { readPage as defaultReadPage } from "../../src/host/read/pipeline.ts";
import type { ReadPageOptions, ReadPageResult } from "../../src/host/read/pipeline.ts";
import { bm25Scores } from "../../src/host/read/rank.ts";
import { renderWebRead } from "../../src/host/read/render.ts";
import { clipCodePoints } from "../../src/host/read/text.ts";
import { evaluateFacts, fraction, normalizeForMatch, factSatisfied } from "./match.ts";
import type { BenchCase } from "./schema.ts";
import { focusOf } from "./schema.ts";
import { estimateTokens } from "./stats.ts";

export type ReadPageFn = (markdown: string, opts?: ReadPageOptions) => ReadPageResult;

export interface EvalOptions {
  budget: number;
  maxRounds: number;
  /** web_fetch output cap in characters (DSH default 200000). */
  baselineMaxChars: number;
}

export interface EvalDeps {
  readPage?: ReadPageFn;
}

export interface RoundInfo {
  kind: "focus" | "section";
  section?: string;
  returnedChars: number;
  tokens: number;
  focusMatched: boolean;
}

export interface CaseResult {
  id: string;
  kind: BenchCase["kind"];
  lang: BenchCase["lang"];
  split: BenchCase["split"];
  budget: number;
  /** False when the facts are not even present in the full page (bad case). */
  valid: boolean;
  invalidReason?: string;
  baselineTokens: number;
  firstTokens: number;
  /** Tokens across all rounds. */
  totalTokens: number;
  rounds: number;
  roundsInfo: RoundInfo[];
  focusMatchedFirst: boolean;
  focusConfidenceFirst?: "strong" | "weak" | "none";
  /** null for negative cases. */
  recallFirstText: number | null;
  recallFirstPassage: number | null;
  recallFinalText: number | null;
  recallFinalPassage: number | null;
  passedFirst: boolean | null;
  passedFinal: boolean | null;
  missingFinal: string[];
  latencyMs: number;
  recallAt1: number | null;
  recallAt3: number | null;
  recallAt5: number | null;
  recallAt10: number | null;
  mrr: number | null;
  bestAnswerRank: number | null;
}

const factLabel = (id: string | undefined, i: number) => id ?? `fact#${i + 1}`;

function passageTexts(result: ReadPageResult): string[] {
  return result.passages.map((p) => `${p.heading}\n${p.text}`);
}

export function evaluateCase(
  markdown: string,
  c: BenchCase,
  opts: EvalOptions,
  deps: EvalDeps = {},
): CaseResult {
  const read = deps.readPage ?? defaultReadPage;
  const focus = focusOf(c);
  const baselineText = clipCodePoints(markdown, opts.baselineMaxChars);
  const baselineTokens = estimateTokens(baselineText);

  // A case is only meaningful if its facts exist in the full page.
  let valid = true;
  let invalidReason: string | undefined;
  if (c.facts.length > 0) {
    const normalized = normalizeForMatch(baselineText);
    const absent = c.facts.map((f, i) => (factSatisfied(normalized, f) ? null : factLabel(f.id, i))).filter(Boolean);
    if (absent.length > 0) {
      valid = false;
      invalidReason = `facts not present in the full page: ${absent.join(", ")}`;
    }
  }

  const started = performance.now();
  const first = read(markdown, { focus, maxChars: opts.budget });
  const latencyMs = performance.now() - started;

  const roundsInfo: RoundInfo[] = [];
  const record = (kind: RoundInfo["kind"], result: ReadPageResult, section?: string): number => {
    const tokens = estimateTokens(renderWebRead({ url: c.url, focus: kind === "focus" ? focus : undefined, result }));
    roundsInfo.push({ kind, section, returnedChars: result.returnedChars, tokens, focusMatched: result.focusMatched });
    return tokens;
  };

  const firstTokens = record("focus", first);
  let totalTokens = firstTokens;
  const seen = new Set(first.passages.map((p) => p.sectionId));
  const texts = passageTexts(first);
  const firstHits = evaluateFacts(texts, c.facts);

  const allSatisfied = (): boolean => evaluateFacts(texts, c.facts).text.every(Boolean);

  // Follow-up rounds: only when the page was cut short and facts are still missing.
  if (c.facts.length > 0 && first.truncated) {
    while (roundsInfo.length < opts.maxRounds && !allSatisfied()) {
      const candidates = first.outline.filter((o) => !seen.has(o.id));
      if (candidates.length === 0) break;
      const scores = bm25Scores(candidates.map((o) => ({ text: o.heading })), focus);
      let best = -1;
      for (let i = 0; i < candidates.length; i++) {
        if (scores[i] > 0 && (best < 0 || scores[i] > scores[best])) best = i;
      }
      if (best < 0) break; // headings give no signal: a model would be guessing too
      const section = candidates[best].id;
      const next = read(markdown, { section, maxChars: opts.budget });
      seen.add(section);
      totalTokens += record("section", next, section);
      texts.push(...passageTexts(next));
    }
  }

  const finalHits = evaluateFacts(texts, c.facts);
  const negative = c.facts.length === 0;
  const missingFinal = c.facts.map((f, i) => (finalHits.text[i] ? null : factLabel(f.id, i))).filter((x): x is string => x !== null);

  let recallAt1: number | null = null;
  let recallAt3: number | null = null;
  let recallAt5: number | null = null;
  let recallAt10: number | null = null;
  let mrr: number | null = null;
  let bestAnswerRank: number | null = null;

  if (c.facts.length > 0) {
    const { chunks } = splitMarkdown(markdown);
    const docs = chunks.map((ch) => ({ text: ch.text, heading: ch.headingPath.join(" ") }));
    const rawScores = focus ? bm25Scores(docs, focus) : chunks.map(() => 0);
    const ranked = chunks.map((_, i) => i).sort((a, b) => (rawScores[b] ?? 0) - (rawScores[a] ?? 0) || a - b);

    const factRanks: number[] = [];
    for (const fact of c.facts) {
      let bestRank: number | null = null;
      for (let r = 0; r < ranked.length; r++) {
        const chunk = chunks[ranked[r]];
        const text = normalizeForMatch(chunk.text + "\n" + chunk.headingPath.join(" "));
        if (factSatisfied(text, fact)) {
          bestRank = r + 1;
          break;
        }
      }
      if (bestRank !== null) factRanks.push(bestRank);
    }

    recallAt1 = factRanks.filter((r) => r <= 1).length / c.facts.length;
    recallAt3 = factRanks.filter((r) => r <= 3).length / c.facts.length;
    recallAt5 = factRanks.filter((r) => r <= 5).length / c.facts.length;
    recallAt10 = factRanks.filter((r) => r <= 10).length / c.facts.length;
    mrr = factRanks.length > 0 ? factRanks.reduce((sum, r) => sum + 1.0 / r, 0) / c.facts.length : 0;
    bestAnswerRank = factRanks.length > 0 ? Math.min(...factRanks) : null;
  }

  return {
    id: c.id,
    kind: c.kind,
    lang: c.lang,
    split: c.split,
    budget: opts.budget,
    valid,
    invalidReason,
    baselineTokens,
    firstTokens,
    totalTokens,
    rounds: roundsInfo.length,
    roundsInfo,
    focusMatchedFirst: first.focusMatched,
    focusConfidenceFirst: first.focusConfidence,
    recallFirstText: negative ? null : fraction(firstHits.text),
    recallFirstPassage: negative ? null : fraction(firstHits.passage),
    recallFinalText: negative ? null : fraction(finalHits.text),
    recallFinalPassage: negative ? null : fraction(finalHits.passage),
    passedFirst: negative ? null : firstHits.text.every(Boolean),
    passedFinal: negative ? null : finalHits.text.every(Boolean),
    missingFinal,
    latencyMs,
    recallAt1,
    recallAt3,
    recallAt5,
    recallAt10,
    mrr,
    bestAnswerRank,
  };
}
