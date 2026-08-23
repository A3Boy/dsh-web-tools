/**
 * dsh-web-tools — in-memory rolling stats (diagnostics only, no persistence).
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
    constructor(max?: number);
    record(entry: StatEntry): void;
    /**
     * Aggregate view for the diagnostics area (last `hours` window).
     * `fallback` counts searches that failed at least once and then succeeded
     * (i.e. real fallback events), not raw failed attempts.
     */
    summary(hours?: number): {
        total: number;
        success: number;
        failed: number;
        fallback: number;
        byProvider: Record<string, {
            success: number;
            failed: number;
            avgLatencyMs: number;
        }>;
    };
}
