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
        const order = chunks
            .map((_, i) => i)
            .filter((i) => scores[i] > 0 && scores[i] >= threshold)
            .sort((a, b) => scores[b] - scores[a] || a - b);
        if (opts.queryTerms && opts.queryTerms.length > 1) {
            const querySet = new Set(opts.queryTerms);
            const chunkTerms = chunks.map((c) => {
                const tokens = tokenize(c.headingPath.join(" ") + " " + c.text);
                return new Set(tokens.filter((t) => querySet.has(t)));
            });
            const uncovered = new Set(querySet);
            // Remove query terms already covered by lead chunk (if picked)
            if (picked.has(0)) {
                for (const t of chunkTerms[0])
                    uncovered.delete(t);
            }
            const candidates = new Set(order.filter((i) => !picked.has(i)));
            while (candidates.size > 0 && used < budget) {
                let bestIdx = -1;
                let bestPriority = -1;
                for (const i of candidates) {
                    if (used + chunks[i].chars > budget)
                        continue;
                    const baseScore = scores[i];
                    const terms = chunkTerms[i];
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
                for (const t of chunkTerms[bestIdx]) {
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
