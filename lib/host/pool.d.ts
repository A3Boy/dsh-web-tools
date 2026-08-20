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
export declare class PoolEntry {
    key: string;
    order: number;
    /** Active concurrent requests currently using this key. */
    inFlight: number;
    /** Searches dispatched through this key so far. */
    uses: number;
    /** False after a failed call; skipped by selection until a full reset. */
    healthy: boolean;
    constructor(key: string, order: number);
}
/**
 * Short diagnostic hint: provider-known prefix (e.g. "tvly") + last 4 chars.
 * Deliberately NOT the first 9 chars of the raw key — enough to identify a
 * key without revealing a significant secret prefix.
 */
export declare function hintOf(key: string): string;
/**
 * Select the next key index: among healthy entries, lowest inFlight first,
 * then fewest total uses; ties broken by fixed `order`. Deterministic & concurrency-aware.
 * @param entries
 * @returns index into `entries`.
 * @throws {Error} empty pool or no healthy key.
 */
export declare function selectIndex(entries: readonly PoolEntry[]): number;
/** Reserve one dispatch slot through `index` (increments inFlight). */
export declare function reserveKey(entries: PoolEntry[], index: number): void;
/** Release one dispatch slot through `index` (decrements inFlight). */
export declare function releaseKey(entries: PoolEntry[], index: number): void;
/** Record one successful dispatch through `index`. */
export declare function markUsed(entries: PoolEntry[], index: number): void;
/** Record one failed dispatch through `index`. */
export declare function markUnhealthy(entries: PoolEntry[], index: number): void;
/** Reset every entry to healthy (called when the whole pool is exhausted). */
export declare function resetHealth(entries: PoolEntry[]): void;
/**
 * Build pool entries from a configured key string.
 * Accepted separators: comma, whitespace/newline, or semicolon.
 * Duplicate keys are dropped (first occurrence keeps its order).
 * Empty input → empty pool (provider effectively unconfigured).
 * @param raw configured credential value.
 * @returns PoolEntry[]
 */
export declare function buildPool(raw: string): PoolEntry[];
/** Pool summary for diagnostics (no secrets). */
export declare function poolSummary(entries: PoolEntry[]): Array<{
    hint: string;
    uses: number;
    healthy: boolean;
}>;
