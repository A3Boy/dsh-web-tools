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
  /** Active concurrent requests currently using this key. */
  inFlight = 0;
  /** Searches dispatched through this key so far. */
  uses = 0;
  /** False after a failed call; skipped by selection until TTL recovery or a full reset. */
  healthy = true;
  /** Timestamp (ms) when marked unhealthy. Used for TTL auto-recovery. */
  unhealthyAt?: number;

  constructor(key: string, order: number) {
    this.key = key;
    this.order = order;
  }
}

/**
 * Short diagnostic hint: provider-known prefix (e.g. "tvly") + last 4 chars.
 * Deliberately NOT the first 9 chars of the raw key — enough to identify a
 * key without revealing a significant secret prefix.
 */
export function hintOf(key: string): string {
  const prefix = key.slice(0, key.indexOf("-") > 0 ? key.indexOf("-") : 4);
  const tail = key.length > 6 ? key.slice(-4) : key;
  return `${prefix}-…${tail}`;
}

/** Default TTL after which an auth-unhealthy key is tentatively retried (15 minutes). */
export const DEFAULT_KEY_UNHEALTHY_TTL_MS = 15 * 60 * 1000;

/**
 * Check if a pool entry is usable: healthy or whose unhealthy cooldown TTL has expired.
 */
export function isEntryUsable(entry: PoolEntry, now = Date.now(), ttlMs = DEFAULT_KEY_UNHEALTHY_TTL_MS): boolean {
  if (entry.healthy) return true;
  if (typeof entry.unhealthyAt === "number" && now - entry.unhealthyAt >= ttlMs) {
    // TTL expired: tentatively restore health to allow a probe dispatch
    entry.healthy = true;
    entry.unhealthyAt = undefined;
    return true;
  }
  return false;
}

/**
 * Select the next key index: among healthy entries, lowest inFlight first,
 * then fewest total uses; ties broken by fixed `order`. Deterministic & concurrency-aware.
 * @param entries
 * @param now current timestamp for TTL evaluation.
 * @returns index into `entries`.
 * @throws {Error} empty pool or no healthy key.
 */
export function selectIndex(entries: readonly PoolEntry[], now = Date.now()): number {
  if (entries.length === 0) throw new Error("provider pool is empty");
  const usable = entries.filter((e: PoolEntry) => isEntryUsable(e, now));
  if (usable.length === 0) throw new Error("provider pool has no healthy keys left");
  let best = usable[0];
  for (const e of usable) {
    if (
      e.inFlight < best.inFlight ||
      (e.inFlight === best.inFlight && e.uses < best.uses) ||
      (e.inFlight === best.inFlight && e.uses === best.uses && e.order < best.order)
    ) {
      best = e;
    }
  }
  return entries.indexOf(best);
}

/** Reserve one dispatch slot through `index` (increments inFlight). */
export function reserveKey(entries: PoolEntry[], index: number): void {
  if (entries[index]) {
    entries[index].inFlight += 1;
  }
}

/** Release one dispatch slot through `index` (decrements inFlight). */
export function releaseKey(entries: PoolEntry[], index: number): void {
  if (entries[index]) {
    entries[index].inFlight = Math.max(0, entries[index].inFlight - 1);
  }
}

/** Record one successful dispatch through `index`. */
export function markUsed(entries: PoolEntry[], index: number): void {
  if (entries[index]) {
    entries[index].uses += 1;
  }
}

/** Record one failed dispatch through `index`. */
export function markUnhealthy(entries: PoolEntry[], index: number, now = Date.now()): void {
  if (entries[index]) {
    entries[index].healthy = false;
    entries[index].unhealthyAt = now;
  }
}

/** Reset every entry to healthy (called when the whole pool is exhausted or quota is refreshed). */
export function resetHealth(entries: PoolEntry[]): void {
  for (const e of entries) {
    e.healthy = true;
    e.unhealthyAt = undefined;
  }
}

/**
 * Build pool entries from a configured key string.
 * Accepted separators: comma, whitespace/newline, or semicolon.
 * Duplicate keys are dropped (first occurrence keeps its order).
 * Empty input → empty pool (provider effectively unconfigured).
 * @param raw configured credential value.
 * @returns PoolEntry[]
 */
export function buildPool(raw: string): PoolEntry[] {
  const parts = (raw ?? "").split(/[,\s;]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
  const seen = new Set<string>();
  const entries: PoolEntry[] = [];
  for (const key of parts) {
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(new PoolEntry(key, entries.length));
  }
  return entries;
}

/** Pool summary for diagnostics (no secrets). */
export function poolSummary(entries: PoolEntry[]): Array<{ hint: string; uses: number; healthy: boolean }> {
  return entries.map((e: PoolEntry) => ({ hint: hintOf(e.key), uses: e.uses, healthy: e.healthy }));
}
