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
export class Stats {
  private entries: StatEntry[] = [];
  constructor(private readonly max = 200) {}

  record(entry: StatEntry) {
    this.entries.push(entry);
    if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
  }

  /** Aggregate view for the diagnostics area (last 24h window). */
  summary(hours = 24): {
    total: number;
    success: number;
    failed: number;
    fallback: number;
    byProvider: Record<string, { success: number; failed: number; avgLatencyMs: number }>;
  } {
    const cutoff = Date.now() - hours * 3600 * 1000;
    const recent = this.entries.filter((e) => e.at >= cutoff);
    const byProvider: Record<string, { success: number; failed: number; avgLatencyMs: number }> = {};
    let success = 0;
    let failed = 0;
    let fallback = 0;
    for (const e of recent) {
      const isSuccess = e.outcome === "success";
      if (isSuccess) success += 1;
      else failed += 1;
      // a search that eventually succeeded after a failed attempt counts as fallback
      if (!isSuccess && e.outcome.startsWith("failed")) fallback += 1;
      const agg = (byProvider[e.provider] ??= { success: 0, failed: 0, avgLatencyMs: 0 });
      if (isSuccess) {
        agg.success += 1;
        agg.avgLatencyMs = agg.avgLatencyMs === 0 ? e.latencyMs : Math.round((agg.avgLatencyMs + e.latencyMs) / 2);
      } else {
        agg.failed += 1;
      }
    }
    return { total: recent.length, success, failed, fallback, byProvider };
  }
}
