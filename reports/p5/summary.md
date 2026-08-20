# P5 Search Quality Evaluation — Final Report

## Environment

- **Date**: 2026-08-20 (10:00–11:00 CST)
- **Node**: v22.22.1, Windows (win32)
- **dsh-web-tools**: commit `7ac1700` (feat/provider-capability-runtime-v2)
- **DSH**: rc.8, host 127.0.0.1:3080
- **Config**: defaultProvider=`firecrawl`, fallbackOrder=`[tavily→exa→brave→jina→parallel→you]`, attemptTimeout=10s
- **Default provider options**: all at P4 defaults (no custom overrides)
- **Corpus**: 36 fixed tasks (6 coding, 6 docs, 6 github, 6 fresh, 6 web, 6 research)
- **Keys**: 7 hosted providers configured (tavily 2, exa 2, firecrawl 1, brave 1, you 1, parallel 1, jina 1)

## Executive Conclusion

**P4 modernization delivers measurable quality.** Top-3 answer-bearing rate ≥ 88% for the
six reliable hosted providers (Exa 97.2%, Brave 94.4%, You 91.7%, Tavily 88.9%, Parallel 88.9%).
Exa is the strongest default candidate (72.2% Top-1, 0% generic, 0% errors, 75% official hit).
**Two real bugs found**: Parallel `maxCharsTotal` option causes HTTP 422 (breaks ALL Parallel
searches when set), and the default provider was `firecrawl` — the weakest hosted option at
33% Top-1, 30.6% error rate.

---

## Provider Ranking (default profile, 36 tasks each)

| Rank | Provider | Top-1% | Top-3% | Official% | Exact% | Generic% | Empty% | Median ms | Errors% |
|------|----------|--------|--------|-----------|--------|----------|--------|-----------|---------|
| 1 | **exa** | 72.2 | 97.2 | 75.0 | 100.0 | 0.0 | 0.0 | 1351 | 0.0 |
| 2 | **you** | 55.6 | 91.7 | 55.6 | 100.0 | 0.0 | 0.0 | 1258 | 0.0 |
| 3 | **brave** | 50.0 | 94.4 | 50.0 | 97.2 | 2.8 | 0.0 | 901 | 0.0 |
| 4 | **tavily** | 47.2 | 88.9 | 47.2 | 94.4 | 5.6 | 0.0 | 2176 | 0.0 |
| 5 | **parallel** | 52.8 | 88.9 | 58.3 | 94.4 | 5.6 | 0.0 | 1948 | 0.0 |
| 6 | firecrawl | 33.3 | 63.9 | 33.3 | 66.7 | 33.3 | 30.6 | 940 | 30.6 |
| 7 | jina | 47.2 | 80.6 | 47.2 | 86.1 | 13.9 | 5.6 | 4552 | 5.6 |

### Ranking by category

Best per category (Top-1 answer-bearing):

| Category | Best | Others |
|----------|------|--------|
| coding | exa (4/6) | parallel (2/6), you (1/6) |
| docs | exa, brave, you, parallel all 4/6 | — |
| github | exa (4/6) | parallel, you (2/6) |
| fresh | exa, you (5/6) | brave (4/6) |
| web | exa (6/6) | you, brave (4/6) |
| research | exa (4/6) | parallel, brave (3/6) |

---

## Bugs Found (confirmed)

### BUG-1: Parallel `maxCharsTotal` breaks all searches (HTTP 422)

- **Confirmed**: default options `{ mode: "advanced", maxCharsTotal: 25000 }` → every search
  returns HTTP 422. Removing `maxCharsTotal` → 36/36 succeed.
- **Root cause**: Parallel API rejects `max_chars_total` in `advanced_settings` (either renamed
  or unsupported on this plan).
- **Impact**: any user who sets maxCharsTotal (including the P4 "更多设置" presets) breaks
  Parallel completely.
- **Fix**: do not send `maxCharsTotal` by default; the adapter should validate/omit it.
  P4 default `maxCharsTotal: 25000` in `src/host/provider-options.ts` MUST be removed.

### BUG-2: default provider is firecrawl — weakest quality + rate limits

- `settings.yaml` shows `defaultProvider: firecrawl`.
- Firecrawl: 33.3% Top-1, 30.6% error (HTTP 429 rate limit after ~15 rapid calls), 33.3% generic.
- **Fix**: change default provider to `exa` (best quality, zero errors).

### BUG-3: Firecrawl rate limit too aggressive for production

- 429 starts after ~13–15 calls in a short window even with 3s delays. As primary provider with
  agent's parallel `queries[]` bursts, this will throttle real usage.
- **Mitigation**: keep Firecrawl in fallback, not default.

---

## P4 A/B Results (12 tasks, same query/keys/window)

| Provider/Profile | Evidence% | Official% | Empty% | Median ms | Verdict |
|------------------|-----------|-----------|--------|-----------|---------|
| exa auto | 92 | 83 | 0 | 1401 | baseline |
| exa fast | 92 | 75 | 0 | **873** | same quality, 38% faster → **recommend default fast** |
| exa deep | **100** | **92** | 0 | 4369 | best but 3.1× slower — keep as advanced option |
| tavily basic | **92** | 67 | 0 | **385** | best value (1 credit, fastest) → **keep default** |
| tavily advanced | 83 | 67 | 0 | 4648 | slower AND worse evidence → **not worth 2 credits** |
| tavily fast | 83 | 17 | 0 | 866 | worse than basic → keep as option only |
| brave auto | **92** | 67 | 0 | 762 | **keep default (LLM Context)** |
| brave web-search | 83 | 67 | 0 | 768 | no benefit → stay with LLM Context |
| you highlights | 83 | 58 | 0 | 954 | keep recommended highlights |
| you none | 83 | **75** | 0 | 891 | slightly more official hits; affects only snippet shape |
| parallel advanced | 83 | **75** | 0 | 2007 | keep recommended advanced |
| parallel basic | 83 | 75 | 0 | 1510 | no quality loss, faster → **consider default basic** |

### Key A/B findings

1. **Exa `fast` ≈ `auto` quality at 38% lower latency** — strong candidate for new default.
2. **Exa `deep` is the only mode that reached 100% evidence** — worth exposing for hard tasks.
3. **Tavily `advanced` is NOT worth 2 credits** — 83% vs basic's 92%, 12× slower.
4. **Brave LLM Context (auto) beats classic web-search** — keep as default.
5. **Parallel `basic` ≈ `advanced` quality at 25% lower latency** — default could be basic.

---

## Multi-query Findings (Exa, 5 scenarios)

| Scenario | 1q ev | 1q URLs | 2q ev | 2q URLs | 4q ev | 4q URLs | Median 1q → 4q |
|----------|-------|---------|-------|---------|-------|---------|-----------------|
| 3 independent unknowns | 3/4 | 5 | **4/4** | 10 | 4/4 | 20 | 2.7s → 4.5s |
| provider-seam arch | 4/4 | 5 | 4/4 | 7 | 4/4 | 17 | 1.2s → 4.9s |
| paraphrase spam (negative) | 1/2 | 5 | 2/2 | 9 | 2/2 | 17 | 1.2s → 3.8s |
| exa search types | 4/4 | 5 | 4/4 | 6 | 4/4 | 13 | 0.9s → 4.4s |
| exa vs tavily | 3/3 | 5 | 3/3 | 10 | 3/3 | 20 | 1.5s → 3.8s |

### Findings

- **2 queries close most evidence gaps** (independent unknowns: 3/4 → 4/4); 4 queries add only
  URL diversity (5 → 20) without new evidence.
- **Source diversity is the real multi-query payoff**: 4 queries tripled unique URLs, which
  matters when the first snippet is insufficient and web_fetch is needed.
- **Paraphrase spam**: even synonyms added coverage here, but at 3× latency — keep multi-query
  for independent unknowns / source angles only.
- **Cost**: 4 queries ≈ 3–4× latency but also 3–4× API cost. **Recommended: 2 queries default
  ceiling for multi-query use; keep 4 available for genuinely independent unknowns.**

---

## Fallback / Runtime Correctness

| Test | Result |
|------|--------|
| AUTH key failover (Exa bad key → Tavily own options) | **PASS** — Tavily used `{searchDepth: advanced}` (its own), not Exa's `{searchType: fast}` |
| API key whitespace trim (all 7 hosted providers) | **PASS** — `"  KEY\r\n"` trimmed, real auth OK |
| P4 options fallback invariant (Exa fails → Tavily keeps own settings) | **PASS** |
| Rejected: Tavily with `maxCharsTotal` (422) | **PASS** — 422 correctly surfaced as error |

---

## Settings That Should Remain Optional (not defaults)

- Exa `deep` / `deep-reasoning` — 100% evidence but 3× latency; only for complex tasks.
- Tavily `advanced` — currently 2 credits with worse evidence than basic; revisit only if
  Tavily's ranking improves.
- Firecrawl cache controls — niche, no measured effect on search quality.
- You.com fetch timeout/age — page-read hygiene, not search quality.

---

## Recommended Default Changes (data-backed)

1. **`defaultProvider`: firecrawl → exa** — exa: 72.2% Top-1, 0 errors. (Or `brave` for
   lowest latency at same evidence tier: 901ms median.)
2. **Exa default searchType: `auto` → `fast`** — same 92% evidence, 873ms vs 1401ms.
3. **Parallel `maxCharsTotal` default removed** — BUG-1 fix; keep `mode: advanced`.
4. **Firecrawl rate-limit guard** — raise per-attempt window / add cooldown so 429 doesn't
   cascade in agent's parallel `queries[]`.
5. **DSH agent prompt**: add explicit multi-query guidance (2 queries for independent
   unknowns, never paraphrase spam) — multi-query data supports 2 as the sweet spot.

## Settings Kept As-Is

- Tavily `basic` default — best value measured.
- Brave LLM Context (auto) — beats classic.
- You highlights default.

---

## Final Output Files

| File | Content |
|------|---------|
| `reports/p5/environment.json` | Fixed environment snapshot |
| `reports/p5/runs.jsonl` | 252 default-profile runs + 132 A/B runs |
| `reports/p5/provider-summary.csv` | Per-provider metrics |
| `reports/p5/profile-ab.csv` | A/B profile comparison |
| `reports/p5/multi-query.csv` | Multi-query comparison |
| `reports/p5/fallback-results.json` | Key trim + fallback invariant |
| `reports/p5/summary.md` | This report |

## P5 Final Verdict

**P5 COMPLETE** — 252 default-profile runs + 132 A/B runs + 5 multi-query scenarios +
runtime correctness suite. Evidence-quality and fallback invariants verified. Data supports:
change provider default to Exa/fast, remove Parallel maxCharsTotal default, add Firecrawl
rate-limit protection, and guide the agent toward 2-query multi-search.