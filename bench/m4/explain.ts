/**
 * M4 benchmark — diagnostic case explainer.
 *
 * Inspects retrieval for a single case:
 *  - Tokenized query terms
 *  - Top 10 scoring chunks and their scores/headings
 *  - Chunks selected under budget
 *  - Occurrence locations of each fact's keywords and answer chunk rank
 *  - Budget-independent metrics: Recall@k (k=1, 3, 5, 10) and MRR
 * @module
 */
import { splitMarkdown, type Chunk } from "../../src/host/read/chunk.ts";
import { bm25Scores, tokenize } from "../../src/host/read/rank.ts";
import { selectPassages } from "../../src/host/read/select.ts";
import { factSatisfied, normalizeForMatch } from "./match.ts";
import type { BenchCase, Fact } from "./schema.ts";
import { focusOf } from "./schema.ts";

export interface ChunkRankInfo {
  rank: number;
  index: number;
  chunkId: string;
  sectionId: string;
  heading: string;
  score: number;
  satisfiedFactIds: string[];
  preview: string;
}

export interface FactDiagnostic {
  factId: string;
  keywords: string[];
  anyKeywords?: string[];
  matchingChunkIndices: number[];
  bestRank: number | null;
  bestScore: number | null;
  selectedUnderBudget: boolean;
}

export interface CaseExplanation {
  caseId: string;
  question: string;
  focus: string;
  tokens: string[];
  totalChunks: number;
  totalSections: number;
  topChunks: ChunkRankInfo[];
  facts: FactDiagnostic[];
  selectedIndices: number[];
  budgetChars: number;
  passedUnderBudget: boolean;
  missingFactIds: string[];
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  report: string;
}

function truncatePreview(text: string, maxLen = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > maxLen ? oneLine.slice(0, maxLen - 3) + "..." : oneLine;
}

export function explainCase(markdown: string, c: BenchCase, budgetChars = 4000): CaseExplanation {
  const focus = focusOf(c);
  const tokens = tokenize(focus);
  const { sections, chunks } = splitMarkdown(markdown);

  const docs = chunks.map((c) => ({
    text: c.text,
    heading: c.headingPath.join(" "),
  }));
  const scores = focus ? bm25Scores(docs, focus) : chunks.map(() => 0);

  const rankedIndices = chunks
    .map((_, i) => i)
    .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || a - b);

  const rankOfIndex = new Map<number, number>();
  rankedIndices.forEach((chunkIdx, rank0) => {
    rankOfIndex.set(chunkIdx, rank0 + 1);
  });

  // Evaluate which chunks satisfy which facts
  const chunkFacts = new Map<number, string[]>();
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const normalized = normalizeForMatch(chunk.text + "\n" + chunk.headingPath.join(" "));
    const matchedFactIds: string[] = [];
    c.facts.forEach((f, fIdx) => {
      const fid = f.id ?? `fact#${fIdx + 1}`;
      if (factSatisfied(normalized, f)) {
        matchedFactIds.push(fid);
      }
    });
    if (matchedFactIds.length > 0) {
      chunkFacts.set(i, matchedFactIds);
    }
  }

  // Fact diagnostics
  const factDiagnostics: FactDiagnostic[] = c.facts.map((f, fIdx) => {
    const fid = f.id ?? `fact#${fIdx + 1}`;
    const matchingIndices: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (chunkFacts.get(i)?.includes(fid)) {
        matchingIndices.push(i);
      }
    }
    let bestRank: number | null = null;
    let bestScore: number | null = null;
    for (const idx of matchingIndices) {
      const r = rankOfIndex.get(idx)!;
      const s = scores[idx] ?? 0;
      if (bestRank === null || r < bestRank) {
        bestRank = r;
        bestScore = s;
      }
    }
    return {
      factId: fid,
      keywords: f.all,
      anyKeywords: f.any,
      matchingChunkIndices: matchingIndices,
      bestRank,
      bestScore,
      selectedUnderBudget: false,
    };
  });

  // Top 10 ranked chunks
  const topChunks: ChunkRankInfo[] = rankedIndices.slice(0, 10).map((idx, rank0) => {
    const chunk = chunks[idx];
    return {
      rank: rank0 + 1,
      index: idx,
      chunkId: chunk.id,
      sectionId: chunk.sectionId,
      heading: chunk.headingPath[chunk.headingPath.length - 1] ?? "(preamble)",
      score: Math.round((scores[idx] ?? 0) * 1000) / 1000,
      satisfiedFactIds: chunkFacts.get(idx) ?? [],
      preview: truncatePreview(chunk.text),
    };
  });

  // Budget selection
  const selection = selectPassages(chunks, scores, { budgetChars, includeLead: true, queryTerms: tokens });
  const selectedIndices = selection.passages.map((p) => p.chunk.index);

  // Check which facts are satisfied by selected passages (concatenated)
  const selectedText = normalizeForMatch(
    selection.passages.map((p) => `${p.chunk.headingPath.join(" ")}\n${p.chunk.text}`).join("\n")
  );
  const missingFactIds: string[] = [];
  factDiagnostics.forEach((fd, i) => {
    const fact = c.facts[i];
    const isSat = factSatisfied(selectedText, fact);
    fd.selectedUnderBudget = isSat;
    if (!isSat) missingFactIds.push(fd.factId);
  });

  const passedUnderBudget = c.facts.length === 0 || missingFactIds.length === 0;

  // Recall@k
  const factsCount = c.facts.length;
  const recallAtK = (k: number): number => {
    if (factsCount === 0) return 1.0;
    const topKIndices = new Set(rankedIndices.slice(0, k));
    const hitCount = factDiagnostics.filter((fd) =>
      fd.matchingChunkIndices.some((idx) => topKIndices.has(idx))
    ).length;
    return hitCount / factsCount;
  };

  const recallAt1 = recallAtK(1);
  const recallAt3 = recallAtK(3);
  const recallAt5 = recallAtK(5);
  const recallAt10 = recallAtK(10);

  // MRR across facts
  let reciprocalSum = 0;
  if (factsCount > 0) {
    for (const fd of factDiagnostics) {
      if (fd.bestRank !== null && fd.bestRank > 0) {
        reciprocalSum += 1.0 / fd.bestRank;
      }
    }
  }
  const mrr = factsCount > 0 ? reciprocalSum / factsCount : 1.0;

  // Build markdown diagnostic report
  const lines: string[] = [];
  lines.push(`# Retrieval Diagnosis: ${c.id}`);
  lines.push(`- Question: ${c.question}`);
  lines.push(`- Focus: ${focus}`);
  lines.push(`- Query tokens (${tokens.length}): [${tokens.map((t) => `\`${t}\``).join(", ")}]`);
  lines.push(`- Document size: ${chunks.length} chunks across ${sections.length} sections`);
  lines.push(`- Budget: ${budgetChars} chars`);
  lines.push("");

  lines.push("## Facts Location and Rank");
  if (c.facts.length === 0) {
    lines.push("(Negative case: no expected facts)");
  } else {
    lines.push("| Fact | Required keywords | In Chunks | Best Rank | Best BM25 | In Selection? |");
    lines.push("|---|---|---:|---:|---:|:---:|");
    for (const fd of factDiagnostics) {
      const kw = fd.keywords.join(", ") + (fd.anyKeywords ? ` (any: ${fd.anyKeywords.join(", ")})` : "");
      const bestR = fd.bestRank !== null ? `#${fd.bestRank}` : "none";
      const bestS = fd.bestScore !== null ? fd.bestScore.toFixed(3) : "n/a";
      const inSel = fd.selectedUnderBudget ? "yes" : "**NO**";
      lines.push(`| ${fd.factId} | \`${kw}\` | ${fd.matchingChunkIndices.length} | ${bestR} | ${bestS} | ${inSel} |`);
    }
  }
  lines.push("");

  lines.push("## Budget-Independent Metrics");
  lines.push(`- Recall@1:  ${(recallAt1 * 100).toFixed(1)}%`);
  lines.push(`- Recall@3:  ${(recallAt3 * 100).toFixed(1)}%`);
  lines.push(`- Recall@5:  ${(recallAt5 * 100).toFixed(1)}%`);
  lines.push(`- Recall@10: ${(recallAt10 * 100).toFixed(1)}%`);
  lines.push(`- Mean Reciprocal Rank (MRR): ${mrr.toFixed(3)}`);
  lines.push("");

  lines.push("## Top 10 Scoring Chunks");
  lines.push("| Rank | Chunk | Section | BM25 | Covers Facts | Text Excerpt |");
  lines.push("|---:|:---:|---|---:|:---:|---|");
  for (const tc of topChunks) {
    const factsTag = tc.satisfiedFactIds.length > 0 ? `**${tc.satisfiedFactIds.join(", ")}**` : "-";
    lines.push(`| #${tc.rank} | \`${tc.chunkId}\` | ${tc.heading} | ${tc.score.toFixed(3)} | ${factsTag} | ${tc.preview} |`);
  }
  lines.push("");

  lines.push(`## Selected Chunks (${selectedIndices.length} chunks, ${selection.returnedChars} chars)`);
  lines.push(`- Focus matched: ${selection.focusMatched}`);
  lines.push(`- Truncated: ${selection.truncated}`);
  lines.push(`- Result under budget ${budgetChars}: ${passedUnderBudget ? "PASS" : "FAIL"}`);
  if (!passedUnderBudget) {
    lines.push(`- Missing facts: ${missingFactIds.join(", ")}`);
  }
  lines.push("| Order | Chunk | Section | BM25 | Facts | Text Excerpt |");
  lines.push("|---:|:---:|---|---:|:---:|---|");
  selection.passages.forEach((p, order) => {
    const idx = p.chunk.index;
    const factsTag = chunkFacts.get(idx)?.join(", ") || "-";
    const heading = p.chunk.headingPath[p.chunk.headingPath.length - 1] ?? "(preamble)";
    lines.push(`| ${order + 1} | \`${p.chunk.id}\` | ${heading} | ${p.score.toFixed(3)} | ${factsTag} | ${truncatePreview(p.chunk.text)} |`);
  });

  return {
    caseId: c.id,
    question: c.question,
    focus,
    tokens,
    totalChunks: chunks.length,
    totalSections: sections.length,
    topChunks,
    facts: factDiagnostics,
    selectedIndices,
    budgetChars,
    passedUnderBudget,
    missingFactIds,
    recallAt1,
    recallAt3,
    recallAt5,
    recallAt10,
    mrr,
    report: lines.join("\n"),
  };
}
