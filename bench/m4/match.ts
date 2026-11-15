/**
 * M4 benchmark — keyword-set fact matching.
 *
 * Text and keywords go through the same normalisation (NFKC, lowercase, Markdown
 * emphasis/backticks removed, whitespace collapsed). Underscores and hyphens are
 * kept: they are part of identifiers like `min_trx_id` and `SHA-1`.
 * @module
 */
import type { Fact } from "./schema.ts";

export type Scope = "text" | "passage";

export function normalizeForMatch(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
}

function has(normalizedText: string, keyword: string): boolean {
  const k = normalizeForMatch(keyword);
  return k.length > 0 && normalizedText.includes(k);
}

/** True when every `all` keyword (and at least one `any`, if given) is present. */
export function factSatisfied(normalizedText: string, fact: Fact): boolean {
  if (!fact.all.every((k) => has(normalizedText, k))) return false;
  if (fact.any && !fact.any.some((k) => has(normalizedText, k))) return false;
  return true;
}

export interface FactHits {
  /** Fact satisfied anywhere in the concatenated returned text. */
  text: boolean[];
  /** Fact satisfied inside a single passage (stricter: keywords must co-occur). */
  passage: boolean[];
}

export function evaluateFacts(passageTexts: string[], facts: Fact[]): FactHits {
  const normalized = passageTexts.map(normalizeForMatch);
  const joined = normalized.join("\n");
  return {
    text: facts.map((f) => factSatisfied(joined, f)),
    passage: facts.map((f) => normalized.some((t) => factSatisfied(t, f))),
  };
}

export function fraction(flags: boolean[]): number {
  return flags.length === 0 ? 1 : flags.filter(Boolean).length / flags.length;
}
