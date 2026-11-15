/**
 * M4 benchmark — CLI runner.
 *
 *   node --experimental-strip-types bench/m4/run.ts [options]
 *
 *   --cases <file>        cases JSON            (default bench/m4/cases.json)
 *   --fixtures <dir>      fixture directory     (default bench/m4/fixtures)
 *   --split dev|test|all  which cases to run    (default dev)
 *   --budgets 2000,4000,6000
 *   --max-rounds 3        1 = first call only; >1 enables follow-up section reads
 *   --out <dir>           report directory      (default bench/m4/results)
 *   --lock <file>         freeze lock           (default bench/m4/cases.lock.json)
 *   --freeze              write the lock for the test split, then exit
 *   --force-refreeze      allow --freeze to overwrite entries whose hash changed
 *   --allow-unfrozen      run the test split even if the lock does not verify
 *                         (the report is stamped UNVERIFIED)
 *
 * Exit codes: 0 ok · 1 usage/IO error · 2 lock verification failed.
 * @module
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCase } from "./evaluate.ts";
import type { CaseResult } from "./evaluate.ts";
import { buildLock, sha256, verifyLock } from "./lock.ts";
import type { LockFile } from "./lock.ts";
import { buildReport } from "./report.ts";
import { leakageWarnings, validateCases } from "./schema.ts";
import type { BenchCase } from "./schema.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface Args {
  cases: string;
  fixtures: string;
  split: "dev" | "test" | "all";
  budgets: number[];
  maxRounds: number;
  out: string;
  lock: string;
  freeze: boolean;
  forceRefreeze: boolean;
  allowUnfrozen: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    cases: path.join(HERE, "cases.json"),
    fixtures: path.join(HERE, "fixtures"),
    split: "dev",
    budgets: [2000, 4000, 6000],
    maxRounds: 3,
    out: path.join(HERE, "results"),
    lock: path.join(HERE, "cases.lock.json"),
    freeze: false,
    forceRefreeze: false,
    allowUnfrozen: false,
  };
  const need = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cases") args.cases = need(i++, a);
    else if (a === "--fixtures") args.fixtures = need(i++, a);
    else if (a === "--split") {
      const v = need(i++, a);
      if (v !== "dev" && v !== "test" && v !== "all") throw new Error("--split must be dev | test | all");
      args.split = v;
    } else if (a === "--budgets") {
      args.budgets = need(i++, a).split(",").map((s) => Number(s.trim()));
      if (args.budgets.some((n) => !Number.isFinite(n) || n < 500)) throw new Error("--budgets must be numbers ≥ 500");
    } else if (a === "--max-rounds") {
      args.maxRounds = Number(need(i++, a));
      if (!Number.isInteger(args.maxRounds) || args.maxRounds < 1) throw new Error("--max-rounds must be an integer ≥ 1");
    } else if (a === "--out") args.out = need(i++, a);
    else if (a === "--lock") args.lock = need(i++, a);
    else if (a === "--freeze") args.freeze = true;
    else if (a === "--force-refreeze") args.forceRefreeze = true;
    else if (a === "--allow-unfrozen") args.allowUnfrozen = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

function readLock(file: string): LockFile | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as LockFile;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.cases)) {
    console.error(`cases file not found: ${args.cases}`);
    return 1;
  }
  const { cases, errors } = validateCases(JSON.parse(readFileSync(args.cases, "utf8")));
  if (errors.length > 0) {
    console.error("Invalid cases file:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    return 1;
  }

  // Load fixtures; remember hashes of the bytes on disk.
  const fixtureText = new Map<string, string>();
  const fixtureHash = new Map<string, string>();
  const missing: string[] = [];
  for (const c of cases) {
    const file = path.join(args.fixtures, `${c.id}.md`);
    if (!existsSync(file)) {
      missing.push(c.id);
      continue;
    }
    const bytes = readFileSync(file);
    fixtureText.set(c.id, bytes.toString("utf8"));
    fixtureHash.set(c.id, sha256(bytes));
  }

  const lock = readLock(args.lock);

  if (args.freeze) {
    const testCases = cases.filter((c) => c.split === "test");
    const absent = testCases.filter((c) => !fixtureHash.has(c.id)).map((c) => c.id);
    if (absent.length > 0) {
      console.error(`cannot freeze: fixtures missing for ${absent.join(", ")}`);
      return 1;
    }
    const next = buildLock(testCases, fixtureHash);
    if (lock && !args.forceRefreeze) {
      const changed = Object.keys(next.entries).filter((id) => {
        const old = lock.entries[id];
        return old && (old.caseHash !== next.entries[id].caseHash || old.fixtureHash !== next.entries[id].fixtureHash);
      });
      if (changed.length > 0) {
        console.error(`refusing to re-freeze changed cases (${changed.join(", ")}). Use --force-refreeze only if you accept that earlier numbers are void.`);
        return 2;
      }
    }
    writeFileSync(args.lock, JSON.stringify(next, null, 2) + "\n");
    console.log(`Froze ${testCases.length} test cases → ${args.lock}`);
    return 0;
  }

  const selected: BenchCase[] = cases.filter((c) => args.split === "all" || c.split === args.split);
  let lockStatus = "n/a (dev split only)";
  if (selected.some((c) => c.split === "test")) {
    const problems = verifyLock(cases, fixtureHash, lock);
    if (problems.length === 0) lockStatus = "verified";
    else if (args.allowUnfrozen) lockStatus = `UNVERIFIED (${problems.length} problems)`;
    else {
      console.error("Test split is not frozen/verified:\n" + problems.map((p) => `  - ${p}`).join("\n"));
      console.error("Tune on the dev split, then run with --freeze. Use --allow-unfrozen only for a dry run.");
      return 2;
    }
  }

  const results: CaseResult[] = [];
  for (const c of selected) {
    const md = fixtureText.get(c.id);
    if (md === undefined) continue;
    for (const budget of args.budgets) {
      results.push(evaluateCase(md, c, { budget, maxRounds: args.maxRounds, baselineMaxChars: 200000 }));
    }
  }

  const { markdown, aggregates } = buildReport(results, {
    generatedAt: new Date().toISOString(),
    command: `bench/m4/run.ts ${process.argv.slice(2).join(" ")}`.trim(),
    split: args.split,
    budgets: args.budgets,
    maxRounds: args.maxRounds,
    lockStatus,
    missingFixtures: selected.filter((c) => missing.includes(c.id)).map((c) => c.id),
    leakageWarnings: leakageWarnings(selected),
    totalCases: cases.length,
  });

  mkdirSync(args.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(args.out, `m4-${args.split}-${stamp}`);
  writeFileSync(`${base}.md`, markdown + "\n");
  writeFileSync(`${base}.json`, JSON.stringify({ aggregates, results }, null, 2) + "\n");

  console.log(markdown.split("\n").slice(0, 24).join("\n"));
  console.log(`\nFull report: ${base}.md`);
  return 0;
}

// Run only when executed directly (the tests import parseArgs).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
