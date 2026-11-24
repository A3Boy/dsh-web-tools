import { tokenize } from "./rank.js";
import { clipCodePoints, cpLength } from "./text.js";
export const DEFAULT_FALLBACK_CHARS = 3000;
const DEFAULT_LEAD_CHARS = 1000;
const DEFAULT_MIN_RELATIVE_SCORE = 0.3;
/** A copy of `chunk` clipped to `max` code points. */
function trimmed(chunk, max) {
    const text = clipCodePoints(chunk.text, max);
    return { ...chunk, text, chars: cpLength(text) };
}
export function selectPassages(chunks, scores, opts) {
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
    const picked = new Map();
    let used = 0;
    const take = (i) => {
        if (picked.has(i))
            return false;
        const chunk = chunks[i];
        if (used + chunk.chars > budget)
            return false;
        picked.set(i, chunk);
        used += chunk.chars;
        return true;
    };
    if (!focusMatched) {
        const cap = Math.min(budget, opts.fallbackChars ?? DEFAULT_FALLBACK_CHARS);
        for (let i = 0; i < chunks.length; i++) {
            if (used + chunks[i].chars > cap)
                break;
            picked.set(i, chunks[i]);
            used += chunks[i].chars;
        }
        if (picked.size === 0) {
            const t = trimmed(chunks[0], cap);
            picked.set(0, t);
            used = t.chars;
        }
    }
    else {
        const leadCap = Math.min(opts.leadChars ?? DEFAULT_LEAD_CHARS, Math.floor(budget * 0.4));
        if ((opts.includeLead ?? true) && chunks[0].chars <= leadCap)
            take(0);
        const threshold = maxScore * (opts.minRelativeScore ?? DEFAULT_MIN_RELATIVE_SCORE);
        const positive = chunks.map((_, i) => i).filter((i) => scores[i] > 0);
        const order = positive
            .filter((i) => scores[i] >= threshold)
            .sort((a, b) => scores[b] - scores[a] || a - b);
        // Chunks below the noise threshold. They are NOT eligible in the plain
        // path, but the coverage-aware loop may reach for them: a chunk carrying
        // an as-yet uncovered fact term must stay reachable even when its BM25
        // score is modest, otherwise the second fact of a multi-fact question can
        // never enter the selection (coverage can only reorder survivors of the
        // filter, not add to them). The priority formula (score x novelty) keeps
        // them behind every threshold-passing chunk that still carries new terms.
        const belowThreshold = positive.filter((i) => scores[i] < threshold);
        if (opts.queryTerms && opts.queryTerms.length > 1) {
            const querySet = new Set(opts.queryTerms);
            // Eligible candidates, below-threshold carriers, and the reserved lead
            // all affect coverage.
            const chunkTerms = new Map();
            for (const i of new Set([...order, ...belowThreshold, ...picked.keys()])) {
                const c = chunks[i];
                const tokens = tokenize(c.headingPath.join(" ") + " " + c.text);
                chunkTerms.set(i, new Set(tokens.filter((t) => querySet.has(t))));
            }
            const uncovered = new Set(querySet);
            // Remove query terms already covered by lead chunk (if picked)
            if (picked.has(0)) {
                for (const t of chunkTerms.get(0))
                    uncovered.delete(t);
            }
            const candidates = new Set([...order, ...belowThreshold].filter((i) => !picked.has(i)));
            while (candidates.size > 0 && used < budget) {
                let bestIdx = -1;
                let bestPriority = -1;
                for (const i of candidates) {
                    if (used + chunks[i].chars > budget)
                        continue;
                    const baseScore = scores[i];
                    const terms = chunkTerms.get(i);
                    let novelty = 0.3;
                    if (terms.size > 0) {
                        let hitUncovered = 0;
                        for (const t of terms) {
                            if (uncovered.has(t))
                                hitUncovered++;
                        }
                        const ratio = hitUncovered / terms.size;
                        novelty = 0.3 + 0.7 * ratio;
                    }
                    const priority = baseScore * novelty;
                    if (priority > bestPriority) {
                        bestPriority = priority;
                        bestIdx = i;
                    }
                }
                if (bestIdx < 0)
                    break;
                take(bestIdx);
                candidates.delete(bestIdx);
                for (const t of chunkTerms.get(bestIdx)) {
                    uncovered.delete(t);
                }
            }
        }
        else {
            for (const i of order)
                take(i);
        }
        // Expand context: strictly within the same section and capped to avoid over-expansion
        if (used < budget) {
            const hits = Array.from(picked.keys())
                .filter((i) => i !== 0 || !opts.includeLead)
                .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
            const maxExpansions = Math.max(1, Math.floor(hits.length * 0.5));
            let expansions = 0;
            for (const idx of hits) {
                if (expansions >= maxExpansions || used >= budget)
                    break;
                const currentSec = chunks[idx].sectionId;
                // Try next chunk in the same section first (narrative continuation)
                if (idx + 1 < chunks.length &&
                    chunks[idx + 1].sectionId === currentSec &&
                    !picked.has(idx + 1)) {
                    if (take(idx + 1)) {
                        expansions++;
                        continue; // At most 1 neighbor per hit chunk
                    }
                }
                // Otherwise try previous chunk in the same section (preceding premise)
                if (idx - 1 >= 0 &&
                    chunks[idx - 1].sectionId === currentSec &&
                    !picked.has(idx - 1)) {
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
