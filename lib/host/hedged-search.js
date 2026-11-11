import { reciprocalRankFusion } from "./fusion.js";
function errorCodeOf(error) {
    const code = error?.code;
    return typeof code === "string" && code.length > 0 ? code : "error";
}
function abortError() {
    const err = new Error("search aborted by caller");
    err.code = "aborted";
    return err;
}
/** Strip fusion-only bookkeeping so callers see plain sources. */
function plainSources(sources) {
    return sources.map((s) => ({
        url: s.url,
        ...(s.title !== undefined ? { title: s.title } : {}),
        ...(s.snippet !== undefined ? { snippet: s.snippet } : {}),
        ...(s.summary !== undefined ? { summary: s.summary } : {}),
        ...(s.publishedAt !== undefined ? { publishedAt: s.publishedAt } : {}),
    }));
}
/**
 * Run two providers under the requested strategy.
 *
 * @throws the winning lane's error when no lane produced a non-empty answer and
 *         no lane legitimately returned an empty set.
 */
export async function runHedgedSearch(providers, searchFn, options = {}) {
    const mode = options.mode ?? "hedged";
    const hedgeDelayMs = Math.max(0, options.hedgeDelayMs ?? 1200);
    const timeoutMs = Math.max(1, options.timeoutMs ?? 6000);
    const parentSignal = options.signal;
    if (parentSignal?.aborted)
        throw abortError();
    const attempts = [];
    const deadline = new AbortController();
    const onParentAbort = () => deadline.abort();
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });
    const deadlineTimer = setTimeout(() => deadline.abort(), timeoutMs);
    deadlineTimer.unref?.();
    let notify = null;
    const changed = () => {
        const fn = notify;
        notify = null;
        fn?.();
    };
    const waitChange = () => new Promise((resolve) => {
        notify = resolve;
    });
    const makeLane = (role, provider) => ({
        role,
        provider,
        controller: new AbortController(),
        started: false,
        done: false,
        status: "pending",
        sources: [],
        latencyMs: 0,
        startedAt: 0,
        recorded: false,
    });
    const primary = makeLane("primary", providers[0]);
    const secondary = makeLane("secondary", providers[1]);
    const startLane = (lane) => {
        if (lane.started)
            return lane.promise ?? Promise.resolve();
        lane.started = true;
        // Link the lane to the shared deadline without touching the other lane.
        if (deadline.signal.aborted)
            lane.controller.abort(deadline.signal.reason);
        else
            deadline.signal.addEventListener("abort", () => lane.controller.abort(deadline.signal.reason), { once: true });
        const startedAt = Date.now();
        lane.startedAt = startedAt;
        lane.promise = (async () => {
            try {
                const res = await searchFn(lane.provider, lane.controller.signal, lane.role);
                lane.latencyMs = Date.now() - startedAt;
                lane.sources = res?.sources ?? [];
                lane.content = res?.content;
                lane.status = lane.sources.length > 0 ? "success" : "empty";
            }
            catch (error) {
                lane.latencyMs = Date.now() - startedAt;
                lane.status = "error";
                lane.error = error;
            }
            finally {
                lane.done = true;
                // A lane cancelled by the winner was already recorded as such; do not
                // append a second, misleading "failed:aborted" entry for it.
                if (!lane.recorded) {
                    lane.recorded = true;
                    attempts.push({
                        provider: lane.provider,
                        latencyMs: lane.latencyMs,
                        outcome: lane.status === "success"
                            ? "success"
                            : lane.status === "empty"
                                ? "empty"
                                : `failed:${errorCodeOf(lane.error)}`,
                    });
                }
                changed();
            }
        })();
        return lane.promise;
    };
    let hedgeTimer;
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
    const abortSignal = new Promise((resolve) => {
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
    const succeeded = (lane) => lane.status === "success";
    /** Nothing succeeded: surface an empty answer if a lane legitimately had one. */
    const finishWithoutSuccess = () => {
        const emptyLane = [primary, secondary].find((l) => l.status === "empty");
        if (emptyLane) {
            return {
                sources: [],
                ...(emptyLane.content !== undefined ? { content: emptyLane.content } : {}),
                backend: emptyLane.provider,
                hedgedLaunched: secondary.started,
                fused: false,
                attempts,
            };
        }
        throw primary.error ?? secondary.error ?? abortError();
    };
    /**
     * Finish with one winning lane.
     *
     * The losing lane is aborted in the caller's `finally`, but that abort settles
     * asynchronously — after the response has already been serialized. Record it
     * here as `cancelled` so the settings card's attempt ledger explains why a
     * second provider's time was spent without a result.
     */
    const finishSingle = (lane) => {
        const loser = lane === primary ? secondary : primary;
        if (loser.started && !loser.done && !loser.recorded) {
            loser.recorded = true;
            attempts.push({
                provider: loser.provider,
                latencyMs: loser.startedAt > 0 ? Date.now() - loser.startedAt : 0,
                outcome: "cancelled",
            });
        }
        return {
            sources: plainSources(lane.sources),
            ...(lane.content !== undefined ? { content: lane.content } : {}),
            backend: lane.provider,
            hedgedLaunched: secondary.started,
            fused: false,
            attempts,
        };
    };
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
                const fused = reciprocalRankFusion(winners.map((lane) => ({ provider: lane.provider, sources: lane.sources })));
                const topContent = winners.find((w) => w.content)?.content;
                return {
                    sources: plainSources(fused),
                    ...(topContent !== undefined ? { content: topContent } : {}),
                    backend: `${winners[0].provider}+${winners[1].provider}`,
                    hedgedLaunched: true,
                    fused: true,
                    attempts,
                };
            }
            if (winners.length === 1)
                return finishSingle(winners[0]);
            return finishWithoutSuccess();
        }
        // ---- hedged -----------------------------------------------------------
        void startLane(primary);
        // Phase 1: does the primary settle before the hedge delay?
        const hedgeDue = new Promise((resolve) => {
            hedgeTimer = setTimeout(() => resolve("hedge"), hedgeDelayMs);
            hedgeTimer.unref?.();
        });
        const primarySettled = primary.promise.then(() => "primary");
        const phase = await Promise.race([primarySettled, hedgeDue]);
        clearHedgeTimer();
        if (phase === "primary") {
            if (primary.status === "success")
                return finishSingle(primary);
            if (primary.status === "empty")
                return finishSingle(primary);
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
            if (primary.done && secondary.done)
                return finishWithoutSuccess();
            if (deadline.signal.aborted) {
                await new Promise((resolve) => setTimeout(resolve, SETTLE_GRACE_MS));
                if (succeeded(primary))
                    return finishSingle(primary);
                if (succeeded(secondary))
                    return finishSingle(secondary);
                return finishWithoutSuccess();
            }
            await waitNext();
        }
    }
    finally {
        clearHedgeTimer();
        clearTimeout(deadlineTimer);
        parentSignal?.removeEventListener("abort", onParentAbort);
        // Abort whichever lane is still in flight: a hedged result must never leave
        // a background request running after we already answered.
        primary.controller.abort();
        secondary.controller.abort();
    }
}
