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
    key;
    order;
    /** Searches dispatched through this key so far. */
    uses = 0;
    /** False after a failed call; skipped by selection until a full reset. */
    healthy = true;
    constructor(key, order) {
        this.key = key;
        this.order = order;
    }
}
/**
 * Short diagnostic hint: provider-known prefix (e.g. "tvly") + last 4 chars.
 * Deliberately NOT the first 9 chars of the raw key — enough to identify a
 * key without revealing a significant secret prefix.
 */
export function hintOf(key) {
    const prefix = key.slice(0, key.indexOf("-") > 0 ? key.indexOf("-") : 4);
    const tail = key.length > 6 ? key.slice(-4) : key;
    return `${prefix}-…${tail}`;
}
/**
 * Select the next key index: among healthy entries, the one with the fewest
 * uses; ties break by fixed `order`. Deterministic.
 * @param entries
 * @returns index into `entries`.
 * @throws {Error} empty pool or no healthy key.
 */
export function selectIndex(entries) {
    if (entries.length === 0)
        throw new Error("provider pool is empty");
    const usable = entries.filter((e) => e.healthy);
    if (usable.length === 0)
        throw new Error("provider pool has no healthy keys left");
    let best = usable[0];
    for (const e of usable) {
        if (e.uses < best.uses || (e.uses === best.uses && e.order < best.order))
            best = e;
    }
    return entries.indexOf(best);
}
/** Record one successful dispatch through `index`. */
export function markUsed(entries, index) {
    entries[index].uses += 1;
}
/** Record one failed dispatch through `index`. */
export function markUnhealthy(entries, index) {
    entries[index].healthy = false;
}
/** Reset every entry to healthy (called when the whole pool is exhausted). */
export function resetHealth(entries) {
    for (const e of entries)
        e.healthy = true;
}
/**
 * Build pool entries from a configured key string.
 * Accepted separators: comma, whitespace/newline, or semicolon.
 * Duplicate keys are dropped (first occurrence keeps its order).
 * Empty input → empty pool (provider effectively unconfigured).
 * @param raw configured credential value.
 * @returns PoolEntry[]
 */
export function buildPool(raw) {
    const parts = (raw ?? "").split(/[,\s;]+/).map((s) => s.trim()).filter((s) => s.length > 0);
    const seen = new Set();
    const entries = [];
    for (const key of parts) {
        if (seen.has(key))
            continue;
        seen.add(key);
        entries.push(new PoolEntry(key, entries.length));
    }
    return entries;
}
/** Pool summary for diagnostics (no secrets). */
export function poolSummary(entries) {
    return entries.map((e) => ({ hint: hintOf(e.key), uses: e.uses, healthy: e.healthy }));
}
