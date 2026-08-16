/**
 * dsh-web-tools — Jina provider adapter.
 *
 * Search: GET https://s.jina.ai/{query}?count=N (Authorization: Bearer,
 *   Accept: application/json) — Jina's official search endpoint returns a
 *   JSON envelope `{ code, status, data: [{ title, url, description,
 *   publishedTime, ... }] }`; we normalize `data[]` into sources and never
 *   hand-parse text.
 * Balance (best effort): GET https://r.jina.ai/ with the Bearer token returns
 *   a text page containing a "Balance left" line with the remaining tokens.
 *   This is a stable-but-unofficial contract — never authoritative, and a
 *   parse failure must degrade to "quota unavailable", never break search.
 * @module
 */
import { providerError, throwIfHttp } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
const JINA_SEARCH_URL = "https://s.jina.ai/";
const JINA_READER_URL = "https://r.jina.ai/";
/** Jina search caps `count` at 20 (per its API docs). */
const JINA_MAX_RESULTS = 20;
export const JINA_META = {
    name: "jina",
    label: "Jina",
    description: "Reader + search (token based)",
    credSuffix: "JINA",
    fetchCapable: true,
    needsBaseUrl: false,
};
export const JinaProvider = {
    ...JINA_META,
    async search(query, maxResults, apiKey, _baseUrl, signal) {
        if (!apiKey)
            throw providerError("config", "Jina API key is not configured");
        const count = Math.min(Math.max(maxResults ?? 5, 1), JINA_MAX_RESULTS);
        const url = `${JINA_SEARCH_URL}${encodeURIComponent(query)}?count=${count}`;
        const res = await fetchWithProxy(url, {
            method: "GET",
            headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
            signal,
        });
        throwIfHttp("Jina", res);
        let body;
        try {
            body = await res.json();
        }
        catch {
            throw providerError("invalid-response", "Jina returned a non-JSON search response");
        }
        return { sources: parseJinaSearchJson(body, count) };
    },
    async fetch(url, apiKey, _baseUrl, signal) {
        if (!apiKey)
            throw providerError("config", "Jina API key is not configured");
        const res = await fetchWithProxy(`${JINA_READER_URL}${encodeURIComponent(url)}`, {
            headers: { authorization: `Bearer ${apiKey}` },
            signal,
        });
        throwIfHttp("Jina", res);
        return { text: await res.text() };
    },
};
/**
 * Parse Jina's official JSON search envelope into normalized sources.
 * The envelope is `{ code, status, data: [...] }`; each data item carries at
 * least `url` (required), plus optional `title` / `description` /
 * `publishedTime`. Items without a usable `url` are skipped; the result is
 * capped at `maxResults`.
 */
export function parseJinaSearchJson(body, maxResults) {
    const data = body?.data;
    if (!Array.isArray(data))
        return [];
    const sources = [];
    for (const item of data) {
        if (sources.length >= maxResults)
            break;
        if (!item || typeof item !== "object")
            continue;
        const { url, title, description, publishedTime } = item;
        if (typeof url !== "string" || url.length === 0)
            continue;
        sources.push({
            url,
            ...(typeof title === "string" && title ? { title } : {}),
            ...(typeof description === "string" && description ? { snippet: description } : {}),
            ...(typeof publishedTime === "string" && publishedTime ? { publishedAt: publishedTime } : {}),
        });
    }
    return sources;
}
/**
 * Parse the "Balance left" line from Jina Reader output (best effort).
 * Defensive: any format change → undefined → quota shows unavailable.
 */
export function parseJinaBalance(text) {
    const line = text.split(/\r?\n/).find((x) => /balance\s+left/i.test(x));
    if (!line)
        return undefined;
    const value = line.match(/([\d,.]+)/)?.[1];
    if (!value)
        return undefined;
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
}
/** Best-effort Jina quota (never authoritative). */
export async function jinaQuota(apiKey, signal) {
    if (!apiKey)
        throw providerError("config", "Jina API key is not configured");
    const res = await fetchWithProxy(JINA_READER_URL, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal,
    });
    if (!res.ok) {
        if (res.status === 401 || res.status === 403)
            throw providerError("auth", `Jina balance auth failed (HTTP ${res.status})`, res.status);
        if (res.status === 429)
            throw providerError("rate-limit", "Jina rate limit exceeded (HTTP 429)", res.status);
        throw providerError("server", `Jina balance failed (HTTP ${res.status})`, res.status);
    }
    const text = await res.text();
    const balance = parseJinaBalance(text);
    return {
        supported: true,
        authoritative: false,
        unit: "tokens",
        ...(balance !== undefined ? { remaining: balance } : {}),
        source: "best_effort_api",
        fetchedAt: Date.now(),
        note: "Best-effort balance from Jina Reader; not an official billing API",
    };
}
