/**
 * dsh-web-tools — in-memory rolling stats (diagnostics + adaptive routing).
 * @module
 */
export interface StatEntry {
    provider: string;
    outcome: string;
    latencyMs: number;
    at: number;
}
/** Simple bounded in-memory ring of recent search attempts. */
export declare class Stats {
    private entries;
    private readonly max;
    /**
     * @param max ring capacity. Sized so a busy multi-provider day still keeps a
     *   usable per-provider sample: at 200 the ring evicted one provider's whole
     *   history within minutes, so `adaptive` kept falling back to its neutral
     *   prior and the order jittered.
     */
    constructor(max?: number);
    record(entry: StatEntry): void;
    /**
     * Aggregate view for the diagnostics area (last `hours` window).
     * `fallback` counts searches that hit an empty/failed provider and then
     * succeeded (i.e. real fallback events), not raw failed attempts.
     */
    summary(hours?: number): {
        total: number;
        success: number;
        failed: number;
        empty: number;
        fallback: number;
        byProvider: Record<string, {
            success: number;
            failed: number;
            empty: number;
            avgLatencyMs: number;
        }>;
    };
}
