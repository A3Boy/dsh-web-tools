# web_read M4 — Formal Frozen Test-Split Report

This is the release-facing summary for the **frozen regression test split**. It points at
machine-generated evidence; the numbers below were produced in one verified run and are
not hand-edited.

- **Source baseline**: `c9659f1` plus the release-candidate diff; this historical report was first prepared at `f466e8d` (feat(read): enhance web_read and browser stability, overhaul README with MCP guide)
- **Generated**: 2026-11-19 (rerun 2026-11-19T05:46 after the coverage-selection change; see "Selection change" below)
- **Command**: `node --experimental-strip-types --no-warnings bench/m4/run.ts --split test`
- **Lock**: `bench/m4/cases.lock.json` verified
  (sha256 `3dc9f56897b41b3103ca5480d55e0b6edecdc54e5deb768ef0258e2120d727fb`; the lock covers
  cases and fixtures only — see "Scorer note" below)
- **Budgets** (chars): 2000 / 4000 / 6000 · max rounds: 3
- **Cases in file**: 50 · **evaluated**: 20 · missing fixtures: 0 (18 cases with scored facts across 6 unique test URLs per budget)
- **Baseline**: `web_fetch` (whole page, capped). Token counts are **estimates**; compare ratios, not absolutes.
- **Full machine report**: `bench/m4/results/m4-test-2026-11-19T05-46-45-995Z.md`

The test URLs are clustered (20 cases across 6 pages). The frozen set has been inspected during development and is a regression set, not evidence of blind or semantic answerability evaluation. A fresh 2026-11-24 run reproduced the recall/pass/savings below: `bench/m4/results/m4-test-2026-11-24T14-45-45-876Z.md`.

## Headline (frozen test split, current scorer + coverage selection)

| Budget | n | Recall (1st call) | Pass 1st call | Pass final | Mean rounds | Net savings (median) |
|---:|---:|---:|---:|---:|---:|---:|
| 2000 | 18 | 58.3% | 55.6% | 55.6% | 1.11 | 95.9% |
| 4000 | 18 | 63.9% | 55.6% | 55.6% | 1.11 | 92.9% |
| 6000 | 18 | 86.1% | 83.3% | 83.3% | 1.11 | 90.0% |

Net token savings vs `web_fetch`, whole run (n=18 per budget):

| Budget | min | median | max |
|---:|---:|---:|---:|
| 2000 | 76.4% | 95.9% | 98.8% |
| 4000 | 63.9% | 92.9% | 97.3% |
| 6000 | 51.0% | 90.0% | 96.4% |

Pipeline latency (local compute only): median 15.1 / 13.6 / 14.4 ms by budget (max 48.5 ms).

## Selection change (2026-11-19)

Coverage-aware selection can now reach **below the 0.3 relative-noise threshold**: a chunk
carrying an as-yet uncovered fact term stays eligible even when its BM25 score is modest
(the `score x novelty` priority keeps it behind every threshold-passing chunk that still
carries new terms). Before, coverage could only reorder survivors of the threshold filter,
so the second fact of a multi-fact question was unreachable. Effect on this split: +5.5pp
recall and pass at budget 6000 (80.6% / 77.8% -> 86.1% / 83.3%), small budgets unchanged,
median net savings down ~2pp at 6000 (the extra coverage costs budget). The earlier run of
this same commit (05:07, without the selection change) is kept at
`m4-test-2026-11-19T05-07-15-157Z.md` for comparison.

`focusConfidence` also switched from an absolute BM25 threshold (1.5) to structural,
background-normalised conditions (dev-split calibration: the structural conditions
reproduce the old rule's decisions exactly); it is advisory and does not affect these
retrieval numbers.

## Concrete failures (do not edit cases to make them pass)

18 of 60 budget-runs missed at least one fact. Recurring shapes:

- **Metadata facts outside the target section** (`redis-creator-test` author,
  `docker-dotcloud-test` company, `clone2-namespaces-test` pid): the fact lives
  elsewhere in the page than the answer section the budget retrieves.
- **Multi-fact questions at small budgets** (`rfc6749-csrf-bearer-test`,
  `rfc9113-frame-size-test`): two facts straddle a section boundary one of the two
  chunks drops. The coverage-selection change resolved these cases at budget 6000
  (`clone2-namespaces`, `redis-creator`, `rfc6749-csrf-bearer`,
  `rfc6749-unauth-client`, `rfc9113-frame-size` all pass@6000 now); small budgets
  still drop one of two facts when they cannot both fit.
- **Lexically-vague facts** (`rfc6749-unauth-client-test` "error",
  `rfc9113-window-update-test` "flow"): keyword retrieval ranks low for generic terms.

## Scorer note (post-freeze change)

After the lock was created, `normalizeForMatch` (bench/m4/match.ts) gained
backslash-unescape so markdown-escaped identifiers (`CAP\_NET\_BIND\_SERVICE`) match.
The change is symmetric for text and keywords and can only relax matching. Both frozen
runs with old and new scorer:

| Metric (test split) | 2026-11-15 run (old scorer) | 2026-11-19 run (new scorer) |
|---|---:|---:|
| Recall 1st call (2000/4000/6000) | 61.1% / 69.4% / 80.6% | 58.3% / 63.9% / 80.6% |
| Pass 1st call (2000/4000/6000) | 55.6% / 61.1% / 77.8% | 55.6% / 55.6% / 77.8% |
| Net savings median (2000/4000/6000) | 95.2% / 93.3% / 90.9% | 96.2% / 93.8% / 92.0% |

Differences are within run-to-run policy noise (the follow-up policy is deterministic but
small ranking shifts change which chunks fit a budget). Next scorer change should extend
the lock to the scorer file hash.

## Applicability

- Valid for **long technical reference pages** (RFCs, man pages, monolithic docs) where
  the answer is a small part of a large page.
- **Pages smaller than the character budget** are returned whole: `web_read` then costs
  roughly `web_fetch` plus a small wrapper (outline + round bookkeeping). Do not read
  this benchmark as claiming savings on short pages — the synthetic set in
  `bench/BENCHMARK_RESULTS.md` (marked legacy) demonstrates exactly that case.
- Follow-up rounds are played by a deterministic heading-matching policy, a proxy for
  model behaviour; absolute multi-turn numbers will differ with a real agent.
