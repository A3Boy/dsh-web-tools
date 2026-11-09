/**
 * dsh-web-tools — Keenable provider adapter.
 *
 * Search: POST https://api.keenable.ai/v1/search (X-API-Key) with
 *   `{ query, max_results, site?, published_after?, published_before? }`;
 *   results live at `results[]` with
 *   `{ title, url, description, snippet, published_at }`. The snippet prefers
 *   `description`, falls back to `snippet`, and is capped either way.
 * Fetch: GET https://api.keenable.ai/v1/fetch?url=... with X-API-Key.
 * API reference: https://docs.keenable.ai/api-reference/search
 * @module
 */
import { providerError, throwIfHttp, resolveContext } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
import { endpointViewOf } from "../endpoints.js";
import { keenableLocalQuota, recordKeenableUsageFromBody } from "./keenable-usage.js";
import { fetchKeenableBalance } from "./keenable-bff.js";
const KEENABLE_SEARCH_URL = "https://api.keenable.ai/v1/search";
const KEENABLE_FETCH_URL = "https://api.keenable.ai/v1/fetch";
const KEENABLE_MAX_RESULTS = 20;
const KEENABLE_SNIPPET_MAX_CHARS = 600;
export const KEENABLE_META = {
    name: "keenable",
    label: "Keenable",
    description: "Web search & clean markdown extraction API",
    credSuffix: "KEENABLE",
    fetchCapable: true,
    needsBaseUrl: false,
};
/** Parse rate limit quota headers from Keenable response. */
export function keenableQuotaFromHeaders(headers) {
    if (!headers) {
        return {
            supported: false,
            authoritative: false,
            unit: "requests",
            source: "dashboard",
            fetchedAt: Date.now(),
            note: "Balance is available in the Keenable dashboard",
        };
    }
    const get = (key) => {
        if (typeof headers.get === "function") {
            return headers.get(key);
        }
        const val = headers[key] ?? headers[key.toLowerCase()];
        return val !== undefined && val !== null ? String(val) : null;
    };
    const limitStr = get("x-ratelimit-limit");
    const remainingStr = get("x-ratelimit-remaining");
    const resetStr = get("x-ratelimit-reset");
    const limit = limitStr !== null ? Number(limitStr) : undefined;
    const remaining = remainingStr !== null ? Number(remainingStr) : undefined;
    let resetAt;
    if (resetStr) {
        const n = Number(resetStr);
        if (Number.isFinite(n) && n > 0) {
            const ms = n < 1e11 ? n * 1000 : n;
            try {
                resetAt = new Date(ms).toISOString();
            }
            catch {
                // ignore invalid date
            }
        }
    }
    const supported = remaining !== undefined || limit !== undefined;
    return {
        supported,
        authoritative: true,
        limit: Number.isFinite(limit) ? limit : undefined,
        remaining: Number.isFinite(remaining) ? remaining : undefined,
        resetAt,
        unit: "requests",
        source: "response_header",
        fetchedAt: Date.now(),
        note: supported ? "From Keenable rate-limit response headers" : "Balance is available in the Keenable dashboard",
    };
}
const keenableQuotaCache = new Map();
export function recordKeenableQuota(apiKey, headers) {
    if (!apiKey || !headers)
        return undefined;
    const snapshot = keenableQuotaFromHeaders(headers);
    if (snapshot.supported) {
        keenableQuotaCache.set(apiKey, snapshot);
        return snapshot;
    }
    return undefined;
}
export async function keenableQuota(apiKey, _baseUrl, signal) {
    // 1) Console balance — the only authoritative number Keenable reports. It is
    //    an undocumented BFF route that needs a console session token
    //    (KEENABLE_REFRESH_TOKEN / KEENABLE_SESSION_TOKEN); null when absent.
    const balance = await fetchKeenableBalance(signal);
    if (balance)
        return balance;
    // 2) Rate-limit headers captured from the last real call, when present.
    const header = keenableQuotaCache.get(apiKey);
    if (header)
        return header;
    // 3) This install's own per-call `usage` ledger (display-only).
    const local = keenableLocalQuota(apiKey);
    if (local)
        return local;
    return {
        supported: false,
        authoritative: false,
        unit: "credits",
        source: "dashboard",
        fetchedAt: Date.now(),
        note: "Run a search or fetch first — Keenable reports per-call usage in the response body; the real balance is in the console",
    };
}
/** Normalize a Keenable `/v1/search` JSON body into sources. Pure, for tests. */
export function parseKeenableSearchJson(body, limit) {
    const results = body?.results;
    if (!Array.isArray(results))
        return [];
    const sources = [];
    for (const r of results) {
        const url = typeof r?.url === "string" ? r.url : "";
        if (!url)
            continue;
        const s = { url };
        if (typeof r.title === "string" && r.title)
            s.title = r.title;
        const rawSnippet = typeof r.description === "string" && r.description
            ? r.description
            : typeof r.snippet === "string" && r.snippet
                ? r.snippet
                : undefined;
        if (rawSnippet) {
            s.snippet = rawSnippet.length > KEENABLE_SNIPPET_MAX_CHARS
                ? rawSnippet.slice(0, KEENABLE_SNIPPET_MAX_CHARS) + "…"
                : rawSnippet;
        }
        if (typeof r.published_at === "string" && r.published_at) {
            s.publishedAt = r.published_at;
        }
        sources.push(s);
        if (sources.length >= limit)
            break;
    }
    return sources;
}
/** Build the `/v1/search` request body, forwarding site and date hints. Pure, for tests. */
export function buildKeenableSearchBody(query, limit, hints) {
    const body = { query, max_results: limit };
    // Keenable takes a single `site`; use the first included domain.
    const site = hints?.domains?.include?.[0];
    if (site)
        body.site = site;
    if (hints?.freshness?.after)
        body.published_after = hints.freshness.after;
    if (hints?.freshness?.before)
        body.published_before = hints.freshness.before;
    return body;
}
export const KeenableProvider = {
    ...KEENABLE_META,
    async search(query, maxResults, apiKey, baseUrl, contextOrSignal) {
        const { signal, hints } = resolveContext(contextOrSignal);
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Keenable API key is not configured");
        const limit = Math.min(Math.max(maxResults ?? 5, 1), KEENABLE_MAX_RESULTS);
        const cleanQ = hints?.cleanQuery ? hints.cleanQuery : query;
        const searchUrl = endpointViewOf("keenable", { keenable: baseUrl })?.url ?? KEENABLE_SEARCH_URL;
        const res = await fetchWithProxy(searchUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                accept: "application/json",
                "x-api-key": token,
                "x-keenable-title": "dsh-web-tools",
            },
            body: JSON.stringify(buildKeenableSearchBody(cleanQ, limit, hints)),
            signal,
        }, { provider: "keenable" });
        throwIfHttp("Keenable", res);
        recordKeenableQuota(token, res.headers);
        let body;
        try {
            body = await res.json();
        }
        catch {
            throw providerError("invalid-response", "Keenable returned a non-JSON search response");
        }
        // The billed charge rides in the body (`usage.credits`), not in a header.
        recordKeenableUsageFromBody(token, body);
        return { sources: parseKeenableSearchJson(body, limit) };
    },
    async fetch(url, apiKey, _baseUrl, contextOrSignal) {
        const { signal } = resolveContext(contextOrSignal);
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Keenable API key is not configured");
        const fetchUrl = `${KEENABLE_FETCH_URL}?url=${encodeURIComponent(url)}`;
        const res = await fetchWithProxy(fetchUrl, {
            method: "GET",
            headers: {
                accept: "application/json, text/markdown;q=0.9, text/plain;q=0.8",
                "x-api-key": token,
                "x-keenable-title": "dsh-web-tools",
            },
            signal,
        }, { provider: "keenable" });
        throwIfHttp("Keenable", res);
        recordKeenableQuota(token, res.headers);
        const contentType = res.headers.get("content-type") || "";
        let content = "";
        let title;
        let author;
        let publishedAt;
        if (contentType.includes("application/json")) {
            try {
                const body = (await res.json());
                content = String(body.markdown ?? body.content ?? body.text ?? "").trim();
                recordKeenableUsageFromBody(token, body);
                if (typeof body.title === "string" && body.title)
                    title = body.title;
                if (typeof body.author === "string" && body.author)
                    author = body.author;
                if (typeof body.published_at === "string" && body.published_at)
                    publishedAt = body.published_at;
            }
            catch {
                // Fall back to reading as text below
            }
        }
        if (!content) {
            content = (await res.text()).trim();
        }
        if (!content) {
            throw providerError("invalid-response", `Keenable returned empty content for ${url}`);
        }
        return {
            text: content,
            ...(title ? { title } : {}),
            ...(author ? { author } : {}),
            ...(publishedAt ? { publishedAt } : {}),
        };
    },
};
