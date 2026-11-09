/**
 * dsh-web-tools — coalesced persistence for display-only quota snapshots.
 *
 * Brave reports quota only in search response headers, so the snapshot for a
 * key changes on (nearly) every search. Writing it straight through means one
 * settings write per search, and on DSH 0.1.7 a settings write edits the
 * profile patch serialized with the Loader hot reload (two patch
 * reconciliations, an atomic file write, and `hmr.runExclusive`), measured at
 * 2.3-2.9s. That is a large price for a value the settings card merely
 * displays, and it competes for the same lock the user's own edits need.
 *
 * This scheduler keeps the value in memory immediately, ignores snapshots that
 * did not actually change, and flushes at most once per quiet window.
 * @module
 */
import type { QuotaSnapshot } from "./quota.ts";
/** Compare a stored snapshot with a new one by value. */
export declare function quotaSnapshotChanged(previous: unknown, next: unknown): boolean;
/** Options for {@link createQuotaPersistScheduler}. */
export interface QuotaPersistOptions {
    /** Quiet window before a flush, in ms (default 60s). */
    delayMs?: number;
    /** Clock, injectable for tests. */
    now?: () => number;
}
/**
 * Coalescing writer for display-only per-key caches (Brave snapshots,
 * Keenable's usage ledger). `T` keeps the stored shape explicit.
 */
export interface QuotaPersistScheduler<T = QuotaSnapshot> {
    /** Adopt the cache loaded from settings so unrelated keys survive a flush. */
    seed: (cache: Record<string, T>) => void;
    /** Record a snapshot; schedules at most one write per quiet window. */
    record: (apiKey: string, snapshot: T) => void;
    /** Write any pending change immediately. */
    flushNow: () => void;
    /** Pending keys not yet written. */
    pendingKeys: () => string[];
    /** Cancel the timer and flush what is pending. */
    dispose: () => void;
}
/**
 * Create a coalescing persistence scheduler.
 * @param write - Persists the merged cache (the settings write).
 * @param options - Window and clock overrides.
 * @returns The scheduler.
 */
export declare function createQuotaPersistScheduler<T = QuotaSnapshot>(write: (cache: Record<string, T>) => void, options?: QuotaPersistOptions): QuotaPersistScheduler<T>;
