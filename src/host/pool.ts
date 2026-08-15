/**
 * dsh-web-tools — per-provider account pool (pure logic, no I/O).
 *
 * Each provider can hold a pool of API keys (e.g. several Tavily accounts).
 * Selection policy: least-used-first with a fixed tie-break order (the key
 * list order). A key that fails a call is marked unhealthy and skipped until
 * the whole pool is exhausted, at which point health resets so a recovered
 * account can be used again.
 *
 * This serves legitimate multi-key / rollover / load-spreading scenarios only.
 * @module
 */

/** One key's live state inside a provider pool. */
export class PoolEntry {
  key: string;
  order: number;
  /** Searches dispatched through this key so far. */
  uses = 0;
  /** False after a failed call; skipped by selection until a full reset. */
  healthy = true;

  constructor(key: string, order: number) {
    this.key = key;
    this.order = order;
  }
}

/** Short diagnostic hint ("tvly-XXXX…abcd"). */
export function hintOf(key: string): string {
  const head = key.slice(0, 9);
  const tail = key.length > 13 ? key.slice(-4) : "";
  return tail ? `${head}…${tail}` : head;
}

/**
 * Select the next key index: among healthy entries, the one with the fewest
 * uses; ties break by fixed `order`. Deterministic.
 * @param entries
 * @returns index into `entries`.
 * @throws {Error} empty pool or no healthy key.
 */
export function selectIndex(entries: readonly PoolEntry[]): number {
  if (entries.length === 0) throw new Error("provider pool is empty");
  const usable = entries.filter((e: PoolEntry) => e.healthy);
  if (usable.length === 0) throw new Error("provider pool has no healthy keys left");
  let best = usable[0];
  for (const e of usable) {
    if (e.uses < best.uses || (e.uses === best.uses && e.order < best.order)) best = e;
  }
  return entries.indexOf(best);
}

/** Record one successful dispatch through `index`. */
export function markUsed(entries: PoolEntry[], index: number): void {
  entries[index].uses += 1;
}

/** Record one failed dispatch through `index`. */
export function markUnhealthy(entries: PoolEntry[], index: number): void {
  entries[index].healthy = false;
}

/** Reset every entry to healthy (called when the whole pool is exhausted). */
export function resetHealth(entries: PoolEntry[]): void {
  for (const e of entries) e.healthy = true;
}

/**
 * Build pool entries from a configured key string.
 * Accepted separators: comma, whitespace/newline, or semicolon.
 * Empty input → empty pool (provider effectively unconfigured).
 * @param raw configured credential value.
 * @returns PoolEntry[]
 */
export function buildPool(raw: string): PoolEntry[] {
  const parts = (raw ?? "").split(/[,\s;]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
  return parts.map((key: string, order: number) => new PoolEntry(key, order));
}

/** Pool summary for diagnostics (no secrets). */
export function poolSummary(entries: PoolEntry[]): Array<{ hint: string; uses: number; healthy: boolean }> {
  return entries.map((e: PoolEntry) => ({ hint: hintOf(e.key), uses: e.uses, healthy: e.healthy }));
}
