/**
 * M4 benchmark — case schema and validation.
 *
 * A case is: a real page (URL → local fixture), a question, the `focus` a model
 * would pass to web_read, and the facts a correct answer needs. Each fact is a
 * set of keywords that must ALL appear (order-independent, normalised), with an
 * optional `any` list for synonyms. Facts are never literal sentences, so they
 * cannot be broken by Markdown layout or punctuation.
 * @module
 */

export const SPLITS = ["dev", "test"] as const;
export const KINDS = ["single", "multi", "vague", "table", "code", "negative"] as const;
export type Split = (typeof SPLITS)[number];
export type Kind = (typeof KINDS)[number];
export type Lang = "en" | "zh" | "other";

export interface Fact {
  /** Optional label used in reports; defaults to `fact#N`. */
  id?: string;
  /** Keywords that must all be present. */
  all: string[];
  /** If given, at least one of these must also be present. */
  any?: string[];
}

export interface BenchCase {
  id: string;
  url: string;
  lang: Lang;
  split: Split;
  kind: Kind;
  /** Natural-language question, as a user would ask it. */
  question: string;
  /**
   * What a model would pass as web_read `focus`. Write it WITHOUT looking at the
   * answer text. Defaults to `question`.
   */
  focus?: string;
  /** Empty for `negative` (unanswerable) cases. */
  facts: Fact[];
  notes?: string;
}

export interface ValidationResult {
  cases: BenchCase[];
  errors: string[];
}

const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string" && s.trim().length > 0);
}

export function validateCases(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const cases: BenchCase[] = [];
  if (!Array.isArray(raw)) return { cases, errors: ["cases file must contain a JSON array"] };

  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const where = `cases[${i}]`;
    if (!isRecord(item)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    const id = typeof item.id === "string" ? item.id : "";
    const tag = id ? `${where} (${id})` : where;
    const before = errors.length;

    if (!ID_RE.test(id)) errors.push(`${tag}: id must match ${ID_RE}`);
    else if (seen.has(id)) errors.push(`${tag}: duplicate id`);
    seen.add(id);

    if (typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) errors.push(`${tag}: url must be http(s)`);
    if (!["en", "zh", "other"].includes(item.lang as string)) errors.push(`${tag}: lang must be en | zh | other`);
    if (!SPLITS.includes(item.split as Split)) errors.push(`${tag}: split must be dev | test`);
    if (!KINDS.includes(item.kind as Kind)) errors.push(`${tag}: kind must be one of ${KINDS.join(", ")}`);
    if (typeof item.question !== "string" || !item.question.trim()) errors.push(`${tag}: question is required`);
    if (item.focus !== undefined && (typeof item.focus !== "string" || !item.focus.trim())) {
      errors.push(`${tag}: focus must be a non-empty string when present`);
    }

    const facts: Fact[] = [];
    if (!Array.isArray(item.facts)) {
      errors.push(`${tag}: facts must be an array`);
    } else {
      item.facts.forEach((f, j) => {
        if (!isRecord(f) || !isNonEmptyStringArray(f.all)) {
          errors.push(`${tag}: facts[${j}].all must be a non-empty array of non-empty strings`);
          return;
        }
        if (f.any !== undefined && !isNonEmptyStringArray(f.any)) {
          errors.push(`${tag}: facts[${j}].any must be a non-empty array of non-empty strings when present`);
          return;
        }
        facts.push({
          id: typeof f.id === "string" ? f.id : undefined,
          all: f.all,
          any: f.any as string[] | undefined,
        });
      });
      if (item.kind === "negative" && item.facts.length > 0) errors.push(`${tag}: negative cases must have no facts`);
      if (item.kind !== "negative" && item.facts.length === 0) errors.push(`${tag}: at least one fact is required`);
      if (item.kind === "multi" && item.facts.length < 2) errors.push(`${tag}: multi cases need at least 2 facts`);
    }

    if (errors.length === before) {
      cases.push({
        id,
        url: item.url as string,
        lang: item.lang as Lang,
        split: item.split as Split,
        kind: item.kind as Kind,
        question: item.question as string,
        focus: item.focus as string | undefined,
        facts,
        notes: typeof item.notes === "string" ? item.notes : undefined,
      });
    }
  });
  return { cases, errors };
}

/** The focus a model would pass: explicit `focus`, else the question. */
export function focusOf(c: BenchCase): string {
  return c.focus ?? c.question;
}

/**
 * Cheap authoring guard: flags cases whose focus already contains most of the
 * answer's keywords (the benchmark would then measure the author's wording,
 * not retrieval).
 */
export function leakageWarnings(cases: BenchCase[], threshold = 0.5): string[] {
  const warnings: string[] = [];
  for (const c of cases) {
    if (c.facts.length === 0) continue;
    const focus = focusOf(c).normalize("NFKC").toLowerCase();
    c.facts.forEach((f, i) => {
      const hit = f.all.filter((k) => focus.includes(k.normalize("NFKC").toLowerCase())).length;
      if (hit / f.all.length > threshold) {
        warnings.push(`${c.id}: focus already contains ${hit}/${f.all.length} keywords of ${f.id ?? `fact#${i + 1}`}`);
      }
    });
  }
  return warnings;
}
