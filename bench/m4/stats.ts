/**
 * M4 benchmark — token estimate and distribution statistics.
 *
 * Token counts are ESTIMATES (CJK ≈ 1 token/char, other text ≈ 4 chars/token).
 * Both sides of every comparison use the same estimator, so ratios are far more
 * trustworthy than the absolute numbers.
 * @module
 */

export const CJK_TOKENS_PER_CHAR = 1.0;
export const OTHER_CHARS_PER_TOKEN = 4;

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (CJK_RE.test(ch)) cjk++;
    else other++;
  }
  return Math.ceil(cjk * CJK_TOKENS_PER_CHAR + other / OTHER_CHARS_PER_TOKEN);
}

export interface Summary {
  n: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  mean: number | null;
  p75: number | null;
  max: number | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarize(values: number[]): Summary {
  if (values.length === 0) return { n: 0, min: null, p25: null, median: null, mean: null, p75: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return {
    n: sorted.length,
    min: sorted[0],
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    mean,
    p75: percentile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };
}
