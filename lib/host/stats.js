/**
 * dsh-web-tools — in-memory rolling stats (diagnostics + adaptive routing).
 * @module
 */
/**
 * Classify a recorded outcome.
 *
 *  - `success`  : the provider answered with results.
 *  - `empty`    : the provider answered, but with zero results. This is NOT a
 *                 provider fault: one obscure query used to demote that source
 *                 for 24h in the adaptive ranking.
 *  - `failed:*` : a real provider fault (auth/network/timeout/rate-limit/...).
 *  - anything else (`skipped-*`) is a routing decision, not evidence about the
 *                 provider, and is ignored by the score.
 */
function classifyOutcome(outcome) {
    if (outcome === "success")
        return "success";
    if (outcome === "empty")
        return "empty";
    if (outcome.startsWith("failed"))
        return "failed";
    return "skip";
}
/** Simple bounded in-memory ring of recent search attempts. */
export class Stats {
    entries = [];
    max;
    /**
     * @param max ring capacity. Sized so a busy multi-provider day still keeps a
     *   usable per-provider sample: at 200 the ring evicted one provider's whole
     *   history within minutes, so `adaptive` kept falling back to its neutral
     *   prior and the order jittered.
     */
    constructor(max = 1000) {
        this.max = max;
    }
    record(entry) {
        this.entries.push(entry);
        if (this.entries.length > this.max)
            this.entries.splice(0, this.entries.length - this.max);
    }
    /**
     * Aggregate view for the diagnostics area (last `hours` window).
     * `fallback` counts searches that hit an empty/failed provider and then
     * succeeded (i.e. real fallback events), not raw failed attempts.
     */
    summary(hours = 24) {
        const cutoff = Date.now() - hours * 3600 * 1000;
        const recent = this.entries.filter((e) => e.at >= cutoff);
        const byProvider = {};
        let success = 0;
        let failed = 0;
        let empty = 0;
        let fallback = 0;
        let runHasSetback = false;
        for (const e of recent) {
            const kind = classifyOutcome(e.outcome);
            if (kind === "skip")
                continue;
            // Chain grouping: a failed/empty attempt starts or continues a run; a
            // success ends it. Success after any setback = a real fallback.
            if (kind === "success") {
                success += 1;
                if (runHasSetback)
                    fallback += 1;
                runHasSetback = false;
            }
            else {
                runHasSetback = true;
                if (kind === "empty")
                    empty += 1;
                else
                    failed += 1;
            }
            const agg = (byProvider[e.provider] ??= { success: 0, failed: 0, empty: 0, sumLatencyMs: 0, latencyCount: 0 });
            if (kind === "success") {
                agg.success += 1;
                agg.sumLatencyMs += e.latencyMs;
                agg.latencyCount += 1;
            }
            else if (kind === "empty") {
                agg.empty += 1;
            }
            else {
                agg.failed += 1;
            }
        }
        const byProviderOut = {};
        for (const [name, agg] of Object.entries(byProvider)) {
            byProviderOut[name] = {
                success: agg.success,
                failed: agg.failed,
                empty: agg.empty,
                avgLatencyMs: agg.latencyCount > 0 ? Math.round(agg.sumLatencyMs / agg.latencyCount) : 0,
            };
        }
        return { total: recent.length, success, failed, empty, fallback, byProvider: byProviderOut };
    }
}
