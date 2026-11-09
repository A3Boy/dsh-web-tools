/**
 * dsh-web-tools — cross-provider retrieval orchestration.
 *
 * Two strategies sit on top of the single-provider executor:
 *
 * 1. hedged (Dean & Barroso, "The Tail at Scale"):
 *    - Start the primary lane.
 *    - If it is still running after `hedgeDelayMs`, start a second lane in
 *      parallel. The FIRST success wins and the loser is ABORTED, so the
 *      cancelled request stops consuming quota instead of running to
 *      completion in the background.
 *    - If the primary settles first, the hedge never launches.
 *
 * 2. fused:
 *    - Start both lanes immediately and wait for both.
 *    - Merge their ranked lists with Reciprocal Rank Fusion (wider recall,
 *      roughly double the provider cost — hence opt-in).
 *
 * Lanes are independent: each has its own AbortController linked to the
 * caller's signal and to one overall deadline, so cancelling one lane can
 * never cancel the other.
 * @module
 */
import type { Source } from "./providers/types.ts";
import { reciprocalRankFusion } from "./fusion.ts";

/** Which lane a provider call belongs to. */
export type LaneRole = "primary" | "secondary";

/** One provider call as the executor sees it. */
export interface ProviderSearchFn {
  (providerName: string, signal: AbortSignal, lane: LaneRole): Promise<{ sources: Source[] }>;
}

export type MultiSourceMode = "hedged" | "fused";

export interface MultiSourceOptions {
  /** "hedged" (default) = first success wins; "fused" = run both and merge. */
  mode?: MultiSourceMode;
  /** Delay before the hedged lane starts. Default: 1200ms. */
  hedgeDelayMs?: number;
  /** Overall budget for the whole multi-source attempt. Default: 6000ms. */
  timeoutMs?: number;
  /** Caller cancellation. */
  signal?: AbortSignal;
}

/** Diagnostics for one lane, in the executor's `attempts` vocabulary. */
export interface LaneAttempt {
  provider: string;
  latencyMs: number;
  outcome: string;
}

export interface MultiSourceResult {
  sources: Source[];
  /** `a` or `a+b` for a fused answer. */
  backend: string;
  /** True when the second lane was actually launched. */
  hedgedLaunched: boolean;
  /** True when two ranked lists were merged with RRF. */
  fused: boolean;
  attempts: LaneAttempt[];
}

type LaneStatus = "pending" | "success" | "empty" | "error";

interface Lane {
  role: LaneRole;
  provider: string;
  controller: AbortController;
  started: boolean;
  done: boolean;
  status: LaneStatus;
  sources: Source[];
  error?: unknown;
  latencyMs: number;
  promise?: Promise<void>;
}

function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.length > 0 ? code : "error";
}

function abortError(): Error {
  const err = new Error("search aborted by caller") as Error & { code?: string };
  err.code = "aborted";
  return err;
}

/** Strip fusion-only bookkeeping so callers see plain sources. */
function plainSources(sources: Source[]): Source[] {
  return sources.map((s) => ({
    url: s.url,
    ...(s.title !== undefined ? { title: s.title } : {}),
    ...(s.snippet !== undefined ? { snippet: s.snippet } : {}),
    ...(s.publishedAt !== undefined ? { publishedAt: s.publishedAt } : {}),
  }));
}

/**
 * Run two providers under the requested strategy.
 *
 * @throws the winning lane's error when no lane produced a non-empty answer and
 *         no lane legitimately returned an empty set.
 */
export async function runHedgedSearch(
  providers: [string, string],
  searchFn: ProviderSearchFn,
  options: MultiSourceOptions = {},
): Promise<MultiSourceResult> {
  const mode: MultiSourceMode = options.mode ?? "hedged";
  const hedgeDelayMs = Math.max(0, options.hedgeDelayMs ?? 1200);
  const timeoutMs = Math.max(1, options.timeoutMs ?? 6000);
  const parentSignal = options.signal;

  if (parentSignal?.aborted) throw abortError();

  const attempts: LaneAttempt[] = [];
  const deadline = new AbortController();
  const onParentAbort = () => deadline.abort();
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  const deadlineTimer = setTimeout(() => deadline.abort(), timeoutMs);
  (deadlineTimer as { unref?: () => void }).unref?.();

  let notify: (() => void) | null = null;
  const changed = () => {
    const fn = notify;
    notify = null;
    fn?.();
  };
  const waitChange = () =>
    new Promise<void>((resolve) => {
      notify = resolve;
    });

  const makeLane = (role: LaneRole, provider: string): Lane => ({
    role,
    provider,
    controller: new AbortController(),
    started: false,
    done: false,
    status: "pending",
    sources: [],
    latencyMs: 0,
  });

  const primary = makeLane("primary", providers[0]);
  const secondary = makeLane("secondary", providers[1]);

  const startLane = (lane: Lane): Promise<void> => {
    if (lane.started) return lane.promise ?? Promise.resolve();
    lane.started = true;
    // Link the lane to the shared deadline without touching the other lane.
    if (deadline.signal.aborted) lane.controller.abort(deadline.signal.reason);
    else deadline.signal.addEventListener("abort", () => lane.controller.abort(deadline.signal.reason), { once: true });

    const startedAt = Date.now();
    lane.promise = (async () => {
      try {
        const res = await searchFn(lane.provider, lane.controller.signal, lane.role);
        lane.latencyMs = Date.now() - startedAt;
        lane.sources = res?.sources ?? [];
        lane.status = lane.sources.length > 0 ? "success" : "empty";
      } catch (error) {
        lane.latencyMs = Date.now() - startedAt;
        lane.status = "error";
        lane.error = error;
      } finally {
        lane.done = true;
        attempts.push({
          provider: lane.provider,
          latencyMs: lane.latencyMs,
          outcome:
            lane.status === "success"
              ? "success"
              : lane.status === "empty"
                ? "empty"
                : `failed:${errorCodeOf(lane.error)}`,
        });
        changed();
      }
    })();
    return lane.promise;
  };

  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  const clearHedgeTimer = () => {
    if (hedgeTimer !== undefined) {
      clearTimeout(hedgeTimer);
      hedgeTimer = undefined;
    }
  };

  /**
   * Wakes the waiting loop on EITHER a lane settling or the deadline firing.
   *
   * Without the deadline arm, a backend that ignores its abort signal would
   * park the loop forever: `waitChange()` alone never resolves when nothing
   * settles.
   */
  const abortSignal = new Promise<void>((resolve) => {
    if (deadline.signal.aborted) {
      resolve();
      return;
    }
    deadline.signal.addEventListener("abort", () => resolve(), { once: true });
  });
  const waitNext = () => Promise.race([waitChange(), abortSignal]);
  /** Grace period for a backend that honours cancellation asynchronously. */
  const SETTLE_GRACE_MS = 250;

  /** Read a lane's status through a call so the compiler cannot narrow it across awaits. */
  const succeeded = (lane: Lane): boolean => lane.status === "success";

  /** Nothing succeeded: surface an empty answer if a lane legitimately had one. */
  const finishWithoutSuccess = (): MultiSourceResult => {
    const emptyLane = [primary, secondary].find((l) => l.status === "empty");
    if (emptyLane) {
      return {
        sources: [],
        backend: emptyLane.provider,
        hedgedLaunched: secondary.started,
        fused: false,
        attempts,
      };
    }
    throw primary.error ?? secondary.error ?? abortError();
  };

  const finishSingle = (lane: Lane): MultiSourceResult => ({
    sources: plainSources(lane.sources),
    backend: lane.provider,
    hedgedLaunched: secondary.started,
    fused: false,
    attempts,
  });

  try {
    if (mode === "fused") {
      void startLane(primary);
      void startLane(secondary);
      while (!(primary.done && secondary.done)) {
        if (deadline.signal.aborted) {
          // One short grace for lanes that honour cancellation lazily, then
          // stop waiting: a stalled backend must not pin the whole request.
          await new Promise((resolve) => setTimeout(resolve, SETTLE_GRACE_MS));
          break;
        }
        await waitNext();
      }

      const winners = [primary, secondary].filter((l) => l.status === "success");
      if (winners.length === 2) {
        const fused = reciprocalRankFusion(
          winners.map((lane) => ({ provider: lane.provider, sources: lane.sources })),
        );
        return {
          sources: plainSources(fused),
          backend: `${winners[0].provider}+${winners[1].provider}`,
          hedgedLaunched: true,
          fused: true,
          attempts,
        };
      }
      if (winners.length === 1) return finishSingle(winners[0]);
      return finishWithoutSuccess();
    }

    // ---- hedged -----------------------------------------------------------
    void startLane(primary);

    // Phase 1: does the primary settle before the hedge delay?
    const hedgeDue = new Promise<"hedge">((resolve) => {
      hedgeTimer = setTimeout(() => resolve("hedge"), hedgeDelayMs);
      (hedgeTimer as { unref?: () => void }).unref?.();
    });
    const primarySettled = primary.promise!.then(() => "primary" as const);
    const phase = await Promise.race([primarySettled, hedgeDue]);
    clearHedgeTimer();

    if (phase === "primary") {
      if (primary.status === "success") return finishSingle(primary);
      if (primary.status === "empty") return finishSingle(primary);
      throw primary.error ?? abortError();
    }

    // Phase 2: the primary is slow — run a hedge lane and take the first success.
    void startLane(secondary);
    while (true) {
      if (primary.status === "success") {
        secondary.controller.abort();
        return finishSingle(primary);
      }
      if (secondary.status === "success") {
        primary.controller.abort();
        return finishSingle(secondary);
      }
      if (primary.done && secondary.done) return finishWithoutSuccess();
      if (deadline.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, SETTLE_GRACE_MS));
        if (succeeded(primary)) return finishSingle(primary);
        if (succeeded(secondary)) return finishSingle(secondary);
        return finishWithoutSuccess();
      }
      await waitNext();
    }
  } finally {
    clearHedgeTimer();
    clearTimeout(deadlineTimer);
    parentSignal?.removeEventListener("abort", onParentAbort);
    // Abort whichever lane is still in flight: a hedged result must never leave
    // a background request running after we already answered.
    primary.controller.abort();
    secondary.controller.abort();
  }
}
