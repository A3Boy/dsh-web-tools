/**
 * dsh-web-tools — Brave Search provider adapter.
 *
 * API: POST https://api.search.brave.com/res/v1/web/search
 * Auth: X-Subscription-Token header.
 * Quota: the response headers carry the monthly request budget
 *   (X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset) — there is
 *   no separate balance endpoint, so quota is captured per search response.
 * @module
 */
import { providerError, throwIfHttp } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
export const BRAVE_META = {
    name: "brave",
    label: "Brave",
    description: "Independent search index",
    credSuffix: "BRAVE",
    fetchCapable: false,
    needsBaseUrl: false,
};
export const BraveProvider = {
    ...BRAVE_META,
    async search(query, maxResults, apiKey, _baseUrl, signal) {
        if (!apiKey)
            throw providerError("config", "Brave API key is not configured");
        const url = new URL(BRAVE_SEARCH_URL);
        url.searchParams.set("q", query);
        url.searchParams.set("count", String(maxResults));
        const res = await fetchWithProxy(url, {
            headers: { "x-subscription-token": apiKey, accept: "application/json" },
            signal,
        });
        throwIfHttp("Brave", res);
        // Capture the rate-limit headers per KEY on every successful search — no
        // extra request; quota/describe reads the snapshot for the current key.
        // Persist it too: the header is the only Brave quota source and must
        // survive restarts (no quota endpoint exists).
        const snapshot = braveQuotaFromHeaders(res.headers);
        lastKnownQuotaByKey.set(apiKey, snapshot);
        persistHook?.(apiKey, snapshot);
        const raw = await res.json();
        const results = Array.isArray(raw?.web?.results) ? raw.web.results : [];
        const sources = results
            .map((r) => {
            const u = typeof r?.url === "string" ? r.url : "";
            if (!u)
                return null;
            const s = { url: u };
            if (typeof r.title === "string" && r.title)
                s.title = r.title;
            if (typeof r.description === "string" && r.description)
                s.snippet = r.description;
            if (typeof r.age === "string" && r.age)
                s.publishedAt = r.age;
            return s;
        })
            .filter((x) => x !== null);
        return { sources };
    },
    async fetch(_url, _apiKey, _baseUrl, _signal) {
        throw providerError("config", "Brave does not provide native fetch");
    },
};
/** Last-known Brave quota snapshots, keyed by API key. */
const lastKnownQuotaByKey = new Map();
/**
 * Optional persistence hook: when a search captures Brave's rate-limit
 * headers, the snapshot is handed here so the host can persist it (Brave has
 * no quota endpoint — the header is the ONLY quota signal, and it must
 * survive restarts). Pure module: hook stays unset unless the host wires it.
 */
let persistHook;
/** Set the persistence callback (host wires this to its settings store). */
export function setBraveQuotaPersist(hook) {
    persistHook = hook;
}
/** Seed the in-memory cache from persisted state (host calls on startup). */
export function seedBraveQuota(apiKey, snapshot) {
    lastKnownQuotaByKey.set(apiKey, snapshot);
}
/** Quota for the settings card: last-known snapshot for the given key. */
export async function braveQuota(apiKey, _baseUrl, _signal) {
    return lastKnownQuotaByKey.get(apiKey) ?? {
        supported: false,
        authoritative: false,
        unit: "requests",
        source: "dashboard",
        fetchedAt: Date.now(),
        note: "Run a search first — Brave reports quota in search response headers",
    };
}
/** Parse Brave quota from the search response headers (monthly window). */
export function braveQuotaFromHeaders(headers, fetchedAt = Date.now()) {
    const limitRaw = headers.get("x-ratelimit-limit");
    const remainingRaw = headers.get("x-ratelimit-remaining");
    // Brave sends comma-separated "per-second, per-month" values. The monthly
    // value is the SECOND one; a single value is the per-second burst window
    // only and carries no monthly quota info (parseBravePair ignores it).
    const monthlyLimit = parseBravePair(limitRaw);
    const monthlyRemaining = parseBravePair(remainingRaw);
    const snapshot = {
        supported: true,
        authoritative: true,
        unit: "requests",
        source: "response_header",
        fetchedAt,
    };
    if (monthlyLimit !== undefined) {
        snapshot.limit = monthlyLimit;
        // Per the Brave docs, a monthly limit of 0 means UNLIMITED — there is no
        // meaningful "remaining" count, so do not report remaining=0 as "0 left".
        if (monthlyLimit > 0) {
            snapshot.remaining = monthlyRemaining ?? 0;
            snapshot.note = "From Brave rate-limit response headers";
        }
        else {
            snapshot.note = "Unlimited monthly quota (0 = unlimited per Brave docs)";
        }
    }
    else {
        // No monthly window in the headers — nothing honest to display.
        snapshot.supported = false;
        snapshot.note = "Monthly quota window not reported in headers";
    }
    return snapshot;
}
/**
 * Take the SECOND (monthly) value of a "sec, month" header pair. A single
 * value is the per-second burst window only — returning undefined there
 * prevents mistaking "0 requests this second" for a zero monthly quota.
 */
function parseBravePair(value) {
    if (!value)
        return undefined;
    const parts = value.split(",").map((s) => Number(s.trim()));
    if (parts.length < 2)
        return undefined; // per-second burst only, no monthly info
    const monthly = parts[1];
    return Number.isFinite(monthly) ? monthly : undefined;
}
