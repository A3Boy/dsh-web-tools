/**
 * dsh-web-tools — budgeted passage selection.
 *
 * Given ranked chunks and a character budget, picks the passages to return:
 *  - with a focus that matches: the lead chunk (intro) plus the best-scoring
 *    chunks that fit the budget, returned in document order;
 *  - with no focus or no match: the start of the document, in order, up to a
 *    fallback size — never an arbitrary slice of the middle.
 * The returned total never exceeds the budget.
 * @module
 */
import type { Chunk } from "./chunk.ts";
import { clipCodePoints, cpLength } from "./text.ts";

export const DEFAULT_FALLBACK_CHARS = 3000;
const DEFAULT_LEAD_CHARS = 1000;
const DEFAULT_MIN_RELATIVE_SCORE = 0.3;

export interface SelectOptions {
  /** Maximum total code points to return. */
  budgetChars: number;
  /** Include the first chunk (page intro) when focus matches. Default true. */
  includeLead?: boolean;
  /** Largest lead chunk worth reserving budget for. Default 1000. */
  leadChars?: number;
  /** Drop matches scoring below this fraction of the best score. Default 0.3. */
  minRelativeScore?: number;
  /** Size of the in-order prefix returned when nothing matches. Default 3000. */
  fallbackChars?: number;
}

export interface SelectedPassage {
  chunk: Chunk;
  score: number;
}

export interface Selection {
  /** Selected passages in document order. */
  passages: SelectedPassage[];
  /** True when the focus produced at least one scoring chunk. */
  focusMatched: boolean;
  returnedChars: number;
  /** True when part of the (pool of the) page was left out. */
  truncated: boolean;
}

/** A copy of `chunk` clipped to `max` code points. */
function trimmed(chunk: Chunk, max: number): Chunk {
  const text = clipCodePoints(chunk.text, max);
  return { ...chunk, text, chars: cpLength(text) };
}

export function selectPassages(chunks: Chunk[], scores: number[], opts: SelectOptions): Selection {
  const budget = Math.max(0, Math.floor(opts.budgetChars));
  const totalChars = chunks.reduce((sum, c) => sum + c.chars, 0);
  if (chunks.length === 0 || budget === 0) {
    return { passages: [], focusMatched: false, returnedChars: 0, truncated: totalChars > 0 };
  }

  const maxScore = scores.reduce((m, s) => (s > m ? s : m), 0);
  const focusMatched = maxScore > 0;

  // When the whole page fits into the effective budget, return all chunks directly in document order
  const effectiveCap = focusMatched ? budget : Math.min(budget, opts.fallbackChars ?? budget);
  if (totalChars <= effectiveCap) {
    return {
      passages: chunks.map((chunk, i) => ({ chunk, score: scores[i] ?? 0 })),
      focusMatched,
      returnedChars: totalChars,
      truncated: false,
    };
  }
  const picked = new Map<number, Chunk>();
  let used = 0;

  const take = (i: number): boolean => {
    if (picked.has(i)) return false;
    const chunk = chunks[i];
    if (used + chunk.chars > budget) return false;
    picked.set(i, chunk);
    used += chunk.chars;
    return true;
  };

  if (!focusMatched) {
    const cap = Math.min(budget, opts.fallbackChars ?? DEFAULT_FALLBACK_CHARS);
    for (let i = 0; i < chunks.length; i++) {
      if (used + chunks[i].chars > cap) break;
      picked.set(i, chunks[i]);
      used += chunks[i].chars;
    }
    if (picked.size === 0) {
      const t = trimmed(chunks[0], cap);
      picked.set(0, t);
      used = t.chars;
    }
  } else {
    const leadCap = Math.min(opts.leadChars ?? DEFAULT_LEAD_CHARS, Math.floor(budget * 0.4));
    if ((opts.includeLead ?? true) && chunks[0].chars <= leadCap) take(0);

    const threshold = maxScore * (opts.minRelativeScore ?? DEFAULT_MIN_RELATIVE_SCORE);
    const order = chunks
      .map((_, i) => i)
      .filter((i) => scores[i] > 0 && scores[i] >= threshold)
      .sort((a, b) => scores[b] - scores[a] || a - b);
    for (const i of order) take(i);

    // Expand context: strictly within the same section and capped to avoid over-expansion
    if (used < budget) {
      const hits = Array.from(picked.keys())
        .filter((i) => i !== 0 || !opts.includeLead)
        .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));

      const maxExpansions = Math.max(1, Math.floor(hits.length * 0.5));
      let expansions = 0;

      for (const idx of hits) {
        if (expansions >= maxExpansions || used >= budget) break;
        const currentSec = chunks[idx].sectionId;

        // Try next chunk in the same section first (narrative continuation)
        if (
          idx + 1 < chunks.length &&
          chunks[idx + 1].sectionId === currentSec &&
          !picked.has(idx + 1)
        ) {
          if (take(idx + 1)) {
            expansions++;
            continue; // At most 1 neighbor per hit chunk
          }
        }

        // Otherwise try previous chunk in the same section (preceding premise)
        if (
          idx - 1 >= 0 &&
          chunks[idx - 1].sectionId === currentSec &&
          !picked.has(idx - 1)
        ) {
          if (take(idx - 1)) {
            expansions++;
          }
        }
      }
    }

    if (picked.size === 0 && order.length > 0) {
      const t = trimmed(chunks[order[0]], budget);
      picked.set(order[0], t);
      used = t.chars;
    }
  }

  const passages = [...picked.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, chunk]) => ({ chunk, score: scores[i] ?? 0 }));
  return { passages, focusMatched, returnedChars: used, truncated: used < totalChars };
}
