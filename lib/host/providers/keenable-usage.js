const usageCache = new Map();
let persistHook = null;
/** UTC month key ("YYYY-MM") for a timestamp. */
export function monthKeyOf(at) {
    return new Date(at).toISOString().slice(0, 7);
}
function nonNegative(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
/** Round away binary-float noise without changing the real value. */
function round6(value) {
    return Math.round(value * 1e6) / 1e6;
}
/**
 * Read the `usage` object of a /v1/search or /v1/fetch response.
 *
 * Keyless, x402 and ZeroClick calls report no usage, and an unparseable body
 * must never look like a free call: anything without a finite non-negative
 * `credits` is ignored.
 */
export function parseKeenableUsage(body) {
    if (!body || typeof body !== "object")
        return null;
    const raw = body.usage;
    if (!raw || typeof raw !== "object")
        return null;
    const usage = raw;
    const credits = nonNegative(usage.credits);
    if (credits === undefined)
        return null;
    const amount = nonNegative(usage.amount);
    const sku = typeof usage.sku === "string" && usage.sku ? usage.sku : undefined;
    return {
        credits,
        paid: usage.paid === true,
        ...(sku ? { sku } : {}),
        ...(amount !== undefined ? { amount } : {}),
    };
}
/**
 * Add one call to the key's monthly ledger.
 * @returns the updated bucket, or undefined for an empty key.
 */
export function recordKeenableUsage(apiKey, usage, now = Date.now()) {
    const key = apiKey.trim();
    if (!key)
        return undefined;
    const month = monthKeyOf(now);
    const previous = usageCache.get(key);
    const bucket = previous && previous.month === month
        ? previous
        : { month, credits: 0, paidCredits: 0, calls: 0 };
    bucket.credits = round6(bucket.credits + usage.credits);
    if (usage.paid)
        bucket.paidCredits = round6(bucket.paidCredits + usage.credits);
    bucket.calls += 1;
    if (usage.sku)
        bucket.lastSku = usage.sku;
    bucket.lastAt = now;
    usageCache.set(key, bucket);
    persistHook?.(key, { ...bucket });
    return { ...bucket };
}
/** Record a call straight from a parsed response body. */
export function recordKeenableUsageFromBody(apiKey, body, now = Date.now()) {
    const usage = parseKeenableUsage(body);
    return usage ? recordKeenableUsage(apiKey, usage, now) : undefined;
}
/** The current month's bucket for a key, or undefined when it is stale/empty. */
export function keenableUsageOf(apiKey, now = Date.now()) {
    const bucket = usageCache.get(apiKey.trim());
    if (!bucket || bucket.month !== monthKeyOf(now))
        return undefined;
    return bucket;
}
/**
 * Build a display-only quota snapshot from the local ledger.
 *
 * `unit: "credits"` with `used` but no `remaining`: the real balance is the
 * console's, and inventing a remaining/limit pair here would feed the router
 * (and the progress bar) a number it cannot justify.
 */
export function keenableLocalQuota(apiKey, now = Date.now()) {
    const bucket = keenableUsageOf(apiKey, now);
    if (!bucket || bucket.calls === 0)
        return undefined;
    const breakdown = { calls: bucket.calls };
    if (bucket.paidCredits > 0)
        breakdown.paid_credits = bucket.paidCredits;
    return {
        supported: true,
        authoritative: false,
        unit: "credits",
        used: bucket.credits,
        breakdown,
        source: "local_estimate",
        fetchedAt: now,
        note: `Local ledger: ${bucket.calls} billed call(s) this month${bucket.lastSku ? `, last SKU ${bucket.lastSku}` : ""} — the console holds the real balance`,
    };
}
/** Install the settings persistence hook (coalesced by the caller). */
export function setKeenableUsagePersist(hook) {
    persistHook = hook;
}
/** Adopt the ledger loaded from settings at boot. */
export function seedKeenableUsageCache(cache) {
    usageCache.clear();
    for (const [key, bucket] of Object.entries(cache ?? {})) {
        if (!key || !bucket || typeof bucket !== "object")
            continue;
        if (typeof bucket.month !== "string" || !/^\d{4}-\d{2}$/.test(bucket.month))
            continue;
        usageCache.set(key, {
            month: bucket.month,
            credits: nonNegative(bucket.credits) ?? 0,
            paidCredits: nonNegative(bucket.paidCredits) ?? 0,
            calls: nonNegative(bucket.calls) ?? 0,
            ...(typeof bucket.lastSku === "string" ? { lastSku: bucket.lastSku } : {}),
            ...(typeof bucket.lastAt === "number" && Number.isFinite(bucket.lastAt) ? { lastAt: bucket.lastAt } : {}),
        });
    }
}
/** Test seam: drop the in-memory ledger. */
export function resetKeenableUsageCache() {
    usageCache.clear();
    persistHook = null;
}
