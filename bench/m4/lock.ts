/**
 * M4 benchmark — freeze lock for the TEST split.
 *
 * Freezing records a hash of each test case definition and of its fixture. The
 * runner refuses to report test-split numbers when anything changed since the
 * freeze, so the test set cannot be quietly edited until the numbers look good.
 * Tune against the dev split; report on the test split.
 * @module
 */
import { createHash } from "node:crypto";
import type { BenchCase } from "./schema.ts";

export interface LockEntry {
  caseHash: string;
  fixtureHash: string;
}

export interface LockFile {
  version: 1;
  frozenAt: string;
  entries: Record<string, LockEntry>;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Hash of everything that defines a case (notes are excluded on purpose). */
export function caseHash(c: BenchCase): string {
  return sha256(
    canonicalJson({
      id: c.id,
      url: c.url,
      lang: c.lang,
      split: c.split,
      kind: c.kind,
      question: c.question,
      focus: c.focus ?? null,
      facts: c.facts.map((f) => ({ id: f.id ?? null, all: f.all, any: f.any ?? null })),
    }),
  );
}

export function buildLock(
  cases: BenchCase[],
  fixtureHashes: Map<string, string>,
  now: Date = new Date(),
): LockFile {
  const entries: Record<string, LockEntry> = {};
  for (const c of cases) {
    if (c.split !== "test") continue;
    const fixtureHash = fixtureHashes.get(c.id);
    if (!fixtureHash) throw new Error(`cannot freeze ${c.id}: fixture is missing`);
    entries[c.id] = { caseHash: caseHash(c), fixtureHash };
  }
  return { version: 1, frozenAt: now.toISOString(), entries };
}

/** Problems that make test-split numbers untrustworthy. Empty array = verified. */
export function verifyLock(
  cases: BenchCase[],
  fixtureHashes: Map<string, string>,
  lock: LockFile | null,
): string[] {
  const problems: string[] = [];
  const testCases = cases.filter((c) => c.split === "test");
  if (!lock) return testCases.length === 0 ? problems : ["no lock file: freeze the test split first (--freeze)"];

  const testIds = new Set(testCases.map((c) => c.id));
  for (const c of testCases) {
    const entry = lock.entries[c.id];
    if (!entry) {
      problems.push(`${c.id}: not frozen`);
      continue;
    }
    if (entry.caseHash !== caseHash(c)) problems.push(`${c.id}: case definition changed since freeze`);
    const current = fixtureHashes.get(c.id);
    if (current !== undefined && entry.fixtureHash !== current) problems.push(`${c.id}: fixture changed since freeze`);
  }
  for (const id of Object.keys(lock.entries)) {
    if (!testIds.has(id)) problems.push(`${id}: frozen but removed from the test split`);
  }
  return problems;
}
