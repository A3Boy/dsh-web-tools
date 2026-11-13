/**
 * dsh-web-tools — deterministic query-focused ranking (BM25).
 *
 * No model call and no dictionary: Latin/digit text is tokenised on word
 * boundaries; CJK text is tokenised into overlapping character bigrams plus
 * unigrams, which is robust without word segmentation and does not depend on
 * the ICU build of the running Node (unlike Intl.Segmenter).
 * @module
 */

const CJK_CLASS = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}";
const TOKEN_RE = new RegExp(`[${CJK_CLASS}]+|(?:(?![${CJK_CLASS}])[\\p{L}\\p{N}])+`, "gu");
const CJK_START_RE = new RegExp(`^[${CJK_CLASS}]`, "u");

const EN_STOP = new Set([
  "the", "an", "of", "to", "in", "is", "are", "was", "were", "and", "or", "for",
  "on", "at", "by", "with", "as", "it", "its", "this", "that", "be", "from",
]);
/** Single CJK characters too common to carry signal. */
const ZH_STOP = new Set(Array.from("的了是在和与及就也都而着或一不我你他她它这那有为以于之"));
/** Pure particles: bigrams containing them are dropped as noise. */
const ZH_PARTICLE = new Set(Array.from("的了着过吗呢吧啊"));

/** Split text into search tokens (lowercased, NFKC-normalised). */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const normalized = text.normalize("NFKC").toLowerCase();
  for (const match of normalized.matchAll(TOKEN_RE)) {
    const token = match[0];
    if (CJK_START_RE.test(token)) {
      const chars = Array.from(token);
      for (const ch of chars) if (!ZH_STOP.has(ch)) out.push(ch);
      for (let i = 0; i + 1 < chars.length; i++) {
        if (ZH_PARTICLE.has(chars[i]) || ZH_PARTICLE.has(chars[i + 1])) continue;
        out.push(chars[i] + chars[i + 1]);
      }
    } else if ((token.length > 1 || /\p{N}/u.test(token)) && !EN_STOP.has(token)) {
      out.push(token);
    }
  }
  return out;
}

export interface Bm25Doc {
  text: string;
  /** Heading path text; its tokens count `headingBoost` times. */
  heading?: string;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
  headingBoost?: number;
}

/**
 * BM25 score of every doc against `query`. Returns an array aligned with
 * `docs`; all zeros when the query has no usable tokens or nothing matches.
 */
export function bm25Scores(docs: Bm25Doc[], query: string, opts: Bm25Options = {}): number[] {
  const { k1 = 1.2, b = 0.75, headingBoost = 2 } = opts;
  const n = docs.length;
  const scores = new Array<number>(n).fill(0);
  const queryTerms = new Set(tokenize(query));
  if (n === 0 || queryTerms.size === 0) return scores;

  const termFreqs: Array<Map<string, number>> = [];
  const lengths: number[] = [];
  const docFreq = new Map<string, number>();

  for (const doc of docs) {
    const bodyTokens = tokenize(doc.text);
    const headingTokens = doc.heading ? tokenize(doc.heading) : [];
    const tf = new Map<string, number>();
    for (const t of bodyTokens) if (queryTerms.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of headingTokens) if (queryTerms.has(t)) tf.set(t, (tf.get(t) ?? 0) + headingBoost);
    termFreqs.push(tf);
    lengths.push(bodyTokens.length + headingTokens.length);
    for (const t of tf.keys()) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }

  const avgLen = lengths.reduce((a, v) => a + v, 0) / n || 1;
  for (let i = 0; i < n; i++) {
    let score = 0;
    for (const [term, f] of termFreqs[i]) {
      const df = docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * lengths[i]) / avgLen));
    }
    scores[i] = score;
  }
  return scores;
}
