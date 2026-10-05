/** Compare a stored snapshot with a new one by value. */
export function quotaSnapshotChanged(previous, next) {
    return JSON.stringify(previous ?? null) !== JSON.stringify(next ?? null);
}
/**
 * Create a coalescing persistence scheduler.
 * @param write - Persists the merged cache (the settings write).
 * @param options - Window and clock overrides.
 * @returns The scheduler.
 */
export function createQuotaPersistScheduler(write, options = {}) {
    const delayMs = options.delayMs ?? 60_000;
    let known = {};
    let dirty = {};
    let timer = null;
    const flushNow = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        const keys = Object.keys(dirty);
        if (keys.length === 0)
            return;
        const merged = { ...known, ...dirty };
        dirty = {};
        known = merged;
        write(merged);
    };
    const schedule = () => {
        if (timer !== null)
            return;
        timer = setTimeout(() => {
            timer = null;
            flushNow();
        }, delayMs);
        // Never keep the process alive just to persist a display cache.
        timer.unref?.();
    };
    return {
        seed(cache) {
            known = { ...cache };
        },
        record(apiKey, snapshot) {
            if (apiKey === "")
                return;
            const previous = Object.hasOwn(dirty, apiKey) ? dirty[apiKey] : known[apiKey];
            if (!quotaSnapshotChanged(previous, snapshot))
                return;
            dirty[apiKey] = snapshot;
            schedule();
        },
        flushNow,
        pendingKeys: () => Object.keys(dirty),
        dispose() {
            flushNow();
        },
    };
}
