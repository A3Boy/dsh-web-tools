import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCase } from "../bench/m4/evaluate.ts";
import type { ReadPageFn } from "../bench/m4/evaluate.ts";
import { buildLock, caseHash, verifyLock } from "../bench/m4/lock.ts";
import { evaluateFacts, factSatisfied, normalizeForMatch } from "../bench/m4/match.ts";
import { aggregate, buildReport } from "../bench/m4/report.ts";
import { leakageWarnings, validateCases } from "../bench/m4/schema.ts";
import type { BenchCase } from "../bench/m4/schema.ts";
import { estimateTokens, summarize } from "../bench/m4/stats.ts";
import type { ReadPageResult } from "../src/host/read/pipeline.ts";

const RUN = fileURLToPath(new URL("../bench/m4/run.ts", import.meta.url));

function mk(over: Partial<BenchCase> = {}): BenchCase {
  return {
    id: "case-a",
    url: "https://example.com/a",
    lang: "en",
    split: "dev",
    kind: "single",
    question: "How long are logs retained?",
    facts: [{ all: ["14 days"] }],
    ...over,
  };
}

// ── schema ────────────────────────────────────────────────────────────────

test("validateCases accepts a well-formed file", () => {
  const raw = [
    { id: "a1", url: "https://x.test/1", lang: "en", split: "dev", kind: "single", question: "q?", facts: [{ all: ["k"] }] },
    { id: "a2", url: "https://x.test/2", lang: "zh", split: "test", kind: "negative", question: "q?", facts: [] },
  ];
  const { cases, errors } = validateCases(raw);
  assert.deepEqual(errors, []);
  assert.equal(cases.length, 2);
});

test("validateCases reports every kind of authoring mistake", () => {
  const raw = [
    { id: "dup", url: "https://x.test", lang: "en", split: "dev", kind: "single", question: "q", facts: [{ all: ["k"] }] },
    { id: "dup", url: "https://x.test", lang: "en", split: "dev", kind: "single", question: "q", facts: [{ all: ["k"] }] },
    { id: "bad url", url: "ftp://x", lang: "en", split: "dev", kind: "single", question: "q", facts: [{ all: ["k"] }] },
    { id: "neg", url: "https://x.test", lang: "en", split: "dev", kind: "negative", question: "q", facts: [{ all: ["k"] }] },
    { id: "multi", url: "https://x.test", lang: "en", split: "dev", kind: "multi", question: "q", facts: [{ all: ["k"] }] },
    { id: "empty-kw", url: "https://x.test", lang: "en", split: "dev", kind: "single", question: "q", facts: [{ all: ["  "] }] },
    { id: "no-facts", url: "https://x.test", lang: "en", split: "dev", kind: "single", question: "q", facts: [] },
  ];
  const { errors } = validateCases(raw);
  const joined = errors.join("\n");
  for (const needle of ["duplicate id", "id must match", "url must be http", "negative cases must have no facts", "multi cases need at least 2", "non-empty array", "at least one fact"]) {
    assert.ok(joined.includes(needle), `missing error: ${needle}\n${joined}`);
  }
  assert.equal(validateCases({}).errors.length, 1);
});

test("leakageWarnings flags a focus that already contains the answer keywords", () => {
  const leaky = mk({ focus: "retained 14 days logs", facts: [{ all: ["14 days", "logs"] }] });
  const clean = mk({ id: "case-b", focus: "log retention policy", facts: [{ all: ["14 days", "purged"] }] });
  const w = leakageWarnings([leaky, clean]);
  assert.equal(w.length, 1);
  assert.ok(w[0].startsWith("case-a"));
});

// ── matching ──────────────────────────────────────────────────────────────

test("keyword sets match regardless of Markdown layout and punctuation", () => {
  const bullets = "ReadView fields:\n- `m_ids`: active ids\n- **min_trx_id**: low water mark\n- max_trx_id\n- creator_trx_id";
  const fact = { all: ["m_ids", "min_trx_id", "max_trx_id", "creator_trx_id"] };
  assert.equal(factSatisfied(normalizeForMatch(bullets), fact), true);
  assert.equal(factSatisfied(normalizeForMatch("only m_ids and min_trx_id here"), fact), false);
});

test("matching is case-, width- and whitespace-insensitive but keeps identifier punctuation", () => {
  assert.equal(factSatisfied(normalizeForMatch("uses the full 20-byte\n  SHA-1 hash"), { all: ["20-BYTE", "sha-1"] }), true);
  assert.equal(factSatisfied(normalizeForMatch("ＳＨＡ-1"), { all: ["sha-1"] }), true);
  assert.equal(factSatisfied(normalizeForMatch("sha 1"), { all: ["sha-1"] }), false);
  assert.equal(factSatisfied(normalizeForMatch("min_trx_id"), { all: ["min trx id"] }), false);
});

test("`any` requires at least one synonym", () => {
  const fact = { all: ["timeout"], any: ["30 seconds", "30s"] };
  assert.equal(factSatisfied(normalizeForMatch("timeout is 30s"), fact), true);
  assert.equal(factSatisfied(normalizeForMatch("timeout is long"), fact), false);
});

test("passage scope is stricter than text scope", () => {
  const hits = evaluateFacts(["alpha beta", "gamma delta"], [{ all: ["alpha", "gamma"] }, { all: ["alpha", "beta"] }]);
  assert.deepEqual(hits.text, [true, true]);
  assert.deepEqual(hits.passage, [false, true]);
});

// ── stats ─────────────────────────────────────────────────────────────────

test("summarize reports the full distribution", () => {
  const s = summarize([5, 1, 3, 2, 4]);
  assert.deepEqual([s.n, s.min, s.p25, s.median, s.mean, s.p75, s.max], [5, 1, 2, 3, 3, 4, 5]);
  assert.equal(summarize([]).median, null);
  assert.equal(summarize([7]).p75, 7);
});

test("estimateTokens weighs CJK heavier per character than Latin text", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("中文"), 2);
  assert.ok(estimateTokens("中文".repeat(100)) > estimateTokens("ab".repeat(100)));
});

// ── lock ──────────────────────────────────────────────────────────────────

test("the lock detects edits to test cases and fixtures, and ignores notes", () => {
  const t1 = mk({ id: "t1", split: "test" });
  const hashes = new Map([["t1", "h1"]]);
  const lock = buildLock([t1, mk({ id: "d1", split: "dev" })], hashes, new Date(0));
  assert.deepEqual(Object.keys(lock.entries), ["t1"]);
  assert.deepEqual(verifyLock([t1], hashes, lock), []);
  assert.deepEqual(verifyLock([{ ...t1, notes: "irrelevant" }], hashes, lock), []);
  assert.ok(verifyLock([{ ...t1, question: "edited" }], hashes, lock)[0].includes("definition changed"));
  assert.ok(verifyLock([t1], new Map([["t1", "h2"]]), lock)[0].includes("fixture changed"));
  assert.ok(verifyLock([t1, mk({ id: "t2", split: "test" })], new Map([["t1", "h1"], ["t2", "x"]]), lock).some((p) => p.includes("t2: not frozen")));
  assert.ok(verifyLock([{ ...t1, split: "dev" }], hashes, lock).some((p) => p.includes("removed from the test split")));
  assert.ok(verifyLock([t1], hashes, null)[0].includes("no lock file"));
  assert.deepEqual(verifyLock([mk({ split: "dev" })], new Map(), null), []);
  assert.throws(() => buildLock([t1], new Map()), /fixture is missing/);
  assert.notEqual(caseHash(t1), caseHash({ ...t1, facts: [{ all: ["other"] }] }));
});

// ── evaluate (retrieval algorithm injected, so these never break on tuning) ─

function fake(over: Partial<ReadPageResult>): ReadPageResult {
  return {
    title: "T",
    outline: [],
    outlineTotal: 0,
    passages: [],
    focusMatched: true,
    truncated: true,
    totalChars: 10000,
    returnedChars: 0,
    ...over,
  } as unknown as ReadPageResult;
}

const OUTLINE = [
  { id: "s0", heading: "Overview", level: 1, chars: 500 },
  { id: "s1", heading: "Retention policy", level: 2, chars: 400 },
  { id: "s2", heading: "Billing", level: 2, chars: 300 },
];
const DOC = "# Doc\n\nLogs are kept for 14 days. " + "filler words ".repeat(2000);

function followUpReader(calls: Array<Record<string, unknown>>): ReadPageFn {
  return (_md, o = {}) => {
    calls.push(o as Record<string, unknown>);
    if (o.section === "s1") {
      return fake({ outline: OUTLINE, truncated: false, returnedChars: 26, passages: [{ sectionId: "s1", heading: "Retention policy", text: "Logs are kept for 14 days.", score: 0 }] });
    }
    return fake({ outline: OUTLINE, returnedChars: 22, passages: [{ sectionId: "s0", heading: "Overview", text: "General overview text.", score: 1 }] });
  };
}

const OPTS = { budget: 2000, maxRounds: 3, baselineMaxChars: 200000 };

test("a missed fact is recovered by a heading-guided follow-up round, and its tokens are counted", () => {
  const calls: Array<Record<string, unknown>> = [];
  const c = mk({ focus: "how long are logs retained policy", facts: [{ all: ["14 days", "logs"] }] });
  const r = evaluateCase(DOC, c, OPTS, { readPage: followUpReader(calls) });
  assert.equal(r.valid, true);
  assert.equal(r.passedFirst, false);
  assert.equal(r.passedFinal, true);
  assert.equal(r.rounds, 2);
  assert.equal(calls[1].section, "s1");
  assert.equal(r.totalTokens, r.roundsInfo.reduce((s, x) => s + x.tokens, 0));
  assert.ok(r.totalTokens > r.firstTokens);
});

test("max-rounds 1 disables follow-ups", () => {
  const c = mk({ focus: "how long are logs retained policy" });
  const r = evaluateCase(DOC, c, { ...OPTS, maxRounds: 1 }, { readPage: followUpReader([]) });
  assert.equal(r.rounds, 1);
  assert.equal(r.passedFinal, false);
  assert.deepEqual(r.missingFinal, ["fact#1"]);
});

test("the harness gives up (like a model guessing) when headings carry no signal", () => {
  const calls: Array<Record<string, unknown>> = [];
  const c = mk({ focus: "zebra xylophone" });
  const r = evaluateCase(DOC, c, OPTS, { readPage: followUpReader(calls) });
  assert.equal(r.rounds, 1);
  assert.equal(calls.length, 1);
});

test("a case whose facts are absent from the full page is flagged invalid", () => {
  const c = mk({ facts: [{ id: "ghost", all: ["unobtainium"] }] });
  const r = evaluateCase(DOC, c, OPTS, { readPage: followUpReader([]) });
  assert.equal(r.valid, false);
  assert.ok(r.invalidReason?.includes("ghost"));
});

test("negative cases report focus matching instead of recall", () => {
  const c = mk({ kind: "negative", facts: [] });
  const r = evaluateCase(DOC, c, OPTS, { readPage: () => fake({ focusMatched: false, passages: [] }) });
  assert.equal(r.valid, true);
  assert.equal(r.passedFinal, null);
  assert.equal(r.recallFinalText, null);
  assert.equal(r.focusMatchedFirst, false);
});

test("savings are measured against the capped whole page and can be negative for tiny pages", () => {
  const big = evaluateCase(DOC, mk(), OPTS, { readPage: () => fake({ truncated: false, returnedChars: 40, passages: [{ sectionId: "s0", heading: "", text: "Logs are kept for 14 days.", score: 1 }] }) });
  const aggBig = aggregate([big], 2000);
  assert.ok((aggBig.savingsNet.median as number) > 0.9);

  const tiny = "Logs are kept for 14 days.";
  const small = evaluateCase(tiny, mk(), OPTS, { readPage: () => fake({ truncated: false, returnedChars: 26, outline: OUTLINE, outlineTotal: 3, passages: [{ sectionId: "s0", heading: "Overview", text: tiny, score: 1 }] }) });
  assert.ok((aggregate([small], 2000).savingsNet.median as number) < 0);
});

test("with the real retrieval pipeline the harness runs end to end", () => {
  const sections = Array.from({ length: 12 }, (_, i) => `## Section ${i}\n\n` + `Generic filler paragraph about topic ${i}. `.repeat(30));
  const md = "# Handbook\n\nIntro text.\n\n" + sections.join("\n\n") + "\n\n## Retention\n\nAudit logs are purged after 14 days by the quartz-7 job.";
  const c = mk({ focus: "audit logs purged quartz job", facts: [{ all: ["quartz-7", "14 days"] }] });
  const r = evaluateCase(md, c, { ...OPTS, budget: 1500 });
  assert.equal(r.valid, true);
  assert.ok(r.baselineTokens > 0 && r.firstTokens > 0);
  assert.ok(r.recallFinalText !== null && r.recallFinalText >= 0 && r.recallFinalText <= 1);
  assert.equal(evaluateCase(md, c, { ...OPTS, budget: 1500, maxRounds: 1 }).rounds, 1);
});

test("the report shows distributions, failures and invalid cases", () => {
  const ok = evaluateCase(DOC, mk({ id: "ok" }), OPTS, { readPage: () => fake({ truncated: false, returnedChars: 40, passages: [{ sectionId: "s0", heading: "", text: "14 days", score: 1 }] }) });
  const bad = evaluateCase(DOC, mk({ id: "bad" }), { ...OPTS, maxRounds: 1 }, { readPage: followUpReader([]) });
  const ghost = evaluateCase(DOC, mk({ id: "ghost", facts: [{ all: ["unobtainium"] }] }), OPTS, { readPage: followUpReader([]) });
  const { markdown } = buildReport([ok, bad, ghost], {
    generatedAt: "now", command: "test", split: "dev", budgets: [2000], maxRounds: 1, lockStatus: "n/a",
    missingFixtures: ["nofile"], leakageWarnings: ["x: leaks"], totalCases: 4,
  });
  for (const needle of ["# web_read benchmark (M4)", "## Failures", "| bad |", "Invalid cases", "ghost", "Missing fixtures", "Possible focus leakage", "p25", "median"]) {
    assert.ok(markdown.includes(needle), needle);
  }
  assert.ok(!markdown.includes("| ghost | single"));
});

// ── CLI workflow: dev → freeze → verified test run ────────────────────────

test("CLI: dev runs freely, test needs a freeze, and edits after the freeze are refused", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "m4-"));
  try {
    const fixtures = path.join(dir, "fixtures");
    mkdirSync(fixtures);
    const doc = (token: string) =>
      "# Manual\n\n" +
      Array.from({ length: 10 }, (_, i) => `## Part ${i}\n\n` + `Filler sentence number ${i}. `.repeat(40)).join("\n\n") +
      `\n\n## Policy\n\nThe ${token} value is 14 days.`;
    writeFileSync(path.join(fixtures, "dev-1.md"), doc("retention"));
    writeFileSync(path.join(fixtures, "test-1.md"), doc("expiry"));
    const cases = [
      { id: "dev-1", url: "https://x.test/1", lang: "en", split: "dev", kind: "single", question: "retention value", facts: [{ all: ["retention", "14 days"] }] },
      { id: "test-1", url: "https://x.test/2", lang: "en", split: "test", kind: "single", question: "expiry value", facts: [{ all: ["expiry", "14 days"] }] },
    ];
    const casesFile = path.join(dir, "cases.json");
    const lock = path.join(dir, "cases.lock.json");
    const out = path.join(dir, "out");
    writeFileSync(casesFile, JSON.stringify(cases));
    const run = (...extra: string[]) =>
      spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", RUN, "--cases", casesFile, "--fixtures", fixtures, "--lock", lock, "--out", out, "--budgets", "1000", ...extra], { encoding: "utf8" });

    assert.equal(run("--split", "dev").status, 0);
    assert.ok(readdirSync(out).some((f) => f.endsWith(".md")));

    const unfrozen = run("--split", "test");
    assert.equal(unfrozen.status, 2);
    assert.ok(unfrozen.stderr.includes("not frozen") || unfrozen.stderr.includes("no lock file"));

    assert.equal(run("--freeze").status, 0);
    const verified = run("--split", "test");
    assert.equal(verified.status, 0, verified.stderr);
    const reportFile = readdirSync(out).filter((f) => f.startsWith("m4-test") && f.endsWith(".md"))[0];
    assert.ok(readFileSync(path.join(out, reportFile), "utf8").includes("verified"));

    writeFileSync(path.join(fixtures, "test-1.md"), doc("expiry") + "\n\nExtra paragraph.");
    const tampered = run("--split", "test");
    assert.equal(tampered.status, 2);
    assert.ok(tampered.stderr.includes("fixture changed"));
    assert.equal(run("--freeze").status, 2);
    assert.equal(run("--freeze", "--force-refreeze").status, 0);
    assert.equal(run("--split", "test").status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
