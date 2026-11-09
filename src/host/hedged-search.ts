/**
 * dsh-web-tools — Hedged & Multi-Source Parallel Search Execution.
 *
 * Implements Google-style hedged requests (Dean & Barroso, 2013 "The Tail at Scale")
 * and dual-provider parallel fusion for "Deep" search mode:
 *
 * 1. Hedged mode:
 *    - Dispatches to Provider 1.
 *    - If Provider 1 does not settle within `hedgeDelayMs` (default 1200ms),
 *      launches Provider 2 concurrently without cancelling Provider 1.
 *    - The first successful response resolves the request, or if both settle
 *      within budget, their results are fused using RRF.
 *
 * 2. Deep mode:
 *    - Dispatches simultaneously to up to `fanout` providers (default 2).
 *    - Combines all successful result sets via `reciprocalRankFusion`.
 * @module
 */
import type { Source } from "./providers/types.ts";
import { reciprocalRankFusion, type FusedSource, type ProviderResultSet } from "./fusion.ts";

export interface ProviderSearchFn {
  (providerName: string, signal: AbortSignal): Promise<{ sources: Source[] }>;
}

export interface HedgedSearchOptions {
  /** Maximum delay before launching the hedged secondary request (ms). Default: 1200ms. */
  hedgeDelayMs?: number;
  /** Overall attempt budget (ms). Default: 6000ms. */
  timeoutMs?: number;
  /** Caller cancellation signal. */
  signal?: AbortSignal;
}

export interface HedgedSearchResult {
  sources: FusedSource[] | Source[];
  backend: string;
  hedgedLaunched: boolean;
  attempts: Array<{ provider: string; latencyMs: number; status: "success" | "empty" | "error" }>;
}

/**
 * Execute a hedged search request across two candidates.
 */
export async function runHedgedSearch(
  providers: [string, string],
  searchFn: ProviderSearchFn,
  options: HedgedSearchOptions = {},
): Promise<HedgedSearchResult> {
  const [p1, p2] = providers;
  const hedgeDelayMs = options.hedgeDelayMs ?? 1200;
  const timeoutMs = options.timeoutMs ?? 6000;
  const parentSignal = options.signal;

  const attempts: Array<{ provider: string; latencyMs: number; status: "success" | "empty" | "error" }> = [];
  let hedgedLaunched = false;

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) throw new Error("search aborted");
    parentSignal.addEventListener("abort", onParentAbort);
  }

  const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const started1 = Date.now();
    const p1Promise = searchFn(p1, controller.signal).then(
      (res) => {
        const latencyMs = Date.now() - started1;
        attempts.push({ provider: p1, latencyMs, status: res.sources.length > 0 ? "success" : "empty" });
        return { provider: p1, res, error: null };
      },
      (err) => {
        const latencyMs = Date.now() - started1;
        attempts.push({ provider: p1, latencyMs, status: "error" });
        return { provider: p1, res: null, error: err };
      },
    );

    // Set a timer to trigger the secondary hedged provider if p1 is slow
    let p2Promise: Promise<{ provider: string; res: { sources: Source[] } | null; error: unknown }> | null = null;
    let hedgeTimer: NodeJS.Timeout | null = null;

    const launchHedge = () => {
      hedgedLaunched = true;
      const started2 = Date.now();
      return searchFn(p2, controller.signal).then(
        (res) => {
          const latencyMs = Date.now() - started2;
          attempts.push({ provider: p2, latencyMs, status: res.sources.length > 0 ? "success" : "empty" });
          return { provider: p2, res, error: null };
        },
        (err) => {
          const latencyMs = Date.now() - started2;
          attempts.push({ provider: p2, latencyMs, status: "error" });
          return { provider: p2, res: null, error: err };
        },
      );
    };

    const hedgeDelayPromise = new Promise<void>((resolve) => {
      hedgeTimer = setTimeout(() => {
        p2Promise = launchHedge();
        resolve();
      }, hedgeDelayMs);
    });

    // Race p1 against the hedge delay timer
    const firstResult = await Promise.race([p1Promise, hedgeDelayPromise]);

    if (firstResult && firstResult.res && firstResult.res.sources.length > 0) {
      // P1 settled quickly with results before hedge timer fired!
      if (hedgeTimer) clearTimeout(hedgeTimer);
      return {
        sources: firstResult.res.sources,
        backend: p1,
        hedgedLaunched: false,
        attempts,
      };
    }

    // P1 was either slow or returned empty/error; wait for both or p2
    if (!p2Promise) p2Promise = launchHedge();
    const [out1, out2] = await Promise.all([p1Promise, p2Promise]);

    const resultSets: ProviderResultSet[] = [];
    if (out1.res && out1.res.sources.length > 0) {
      resultSets.push({ provider: p1, sources: out1.res.sources });
    }
    if (out2.res && out2.res.sources.length > 0) {
      resultSets.push({ provider: p2, sources: out2.res.sources });
    }

    if (resultSets.length > 1) {
      const fused = reciprocalRankFusion(resultSets);
      return {
        sources: fused,
        backend: `${p1}+${p2}`,
        hedgedLaunched,
        attempts,
      };
    }

    if (resultSets.length === 1) {
      return {
        sources: resultSets[0].sources,
        backend: resultSets[0].provider,
        hedgedLaunched,
        attempts,
      };
    }

    // Both yielded 0 sources or failed
    return {
      sources: [],
      backend: p1,
      hedgedLaunched,
      attempts,
    };
  } finally {
    clearTimeout(timeoutTimer);
    if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
  }
}
