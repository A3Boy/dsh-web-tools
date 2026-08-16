/**
 * dsh-web-tools — in-memory rolling stats (diagnostics only, no persistence).
 * @module
 */
/** Simple bounded in-memory ring of recent search attempts. */
export class Stats {
    max;
    entries = [];
    constructor(max = 200) {
        this.max = max;
    }
    record(entry) {
        this.entries.push(entry);
        if (this.entries.length > this.max)
            this.entries.splice(0, this.entries.length - this.max);
    }
    /**
     * Aggregate view for the diagnostics area (last `hours` window).
     * `fallback` counts searches that failed at least once and then succeeded
     * (i.e. real fallback events), not raw failed attempts.
     */
    summary(hours = 24) {
        const cutoff = Date.now() - hours * 3600 * 1000;
        const recent = this.entries.filter((e) => e.at >= cutoff);
        const byProvider = {};
        let success = 0;
        let failed = 0;
        let fallback = 0;
        let runHasFailure = false;
        for (const e of recent) {
            const isSuccess = e.outcome === "success";
            // Chain grouping: a "failed:*" attempt starts/continues a run; a
            // success ends it. Success after any failure = a real fallback.
            if (!isSuccess) {
                runHasFailure = true;
                failed += 1;
            }
            else {
                success += 1;
                if (runHasFailure)
                    fallback += 1;
                runHasFailure = false;
            }
            const agg = (byProvider[e.provider] ??= { success: 0, failed: 0, sumLatencyMs: 0, latencyCount: 0 });
            if (isSuccess) {
                agg.success += 1;
                agg.sumLatencyMs += e.latencyMs;
                agg.latencyCount += 1;
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
                avgLatencyMs: agg.latencyCount > 0 ? Math.round(agg.sumLatencyMs / agg.latencyCount) : 0,
            };
        }
        return { total: recent.length, success, failed, fallback, byProvider: byProviderOut };
    }
}
