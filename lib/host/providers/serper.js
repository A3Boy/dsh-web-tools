/**
 * dsh-web-tools — Serper (Google Search) provider adapter.
 *
 * Search: POST https://google.serper.dev/search (X-API-KEY) with
 *   `{ q, num, gl?, hl?, tbs? }`; results live at `organic[]` with
 *   `{ title, link, snippet, date }`, plus optional `answerBox` or `knowledgeGraph`.
 * API reference: https://serper.dev/playground
 * @module
 */
import { providerError, throwIfHttp, resolveContext } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
import { endpointViewOf } from "../endpoints.js";
const SERPER_SEARCH_URL = "https://google.serper.dev/search";
const SERPER_MAX_RESULTS = 20;
export const SERPER_META = {
    name: "serper",
    label: "Serper (Google)",
    description: "Google search API with rich snippets and knowledge graph",
    credSuffix: "SERPER",
    fetchCapable: false,
    needsBaseUrl: false,
};
/** Map SearchHints freshness to Google tbs parameter: qdr:d, qdr:w, qdr:m, qdr:y */
export function mapSerperFreshness(hints) {
    if (!hints?.freshness?.preset)
        return undefined;
    switch (hints.freshness.preset) {
        case "day": return "qdr:d";
        case "week": return "qdr:w";
        case "month": return "qdr:m";
        case "year": return "qdr:y";
    }
}
/** Build the `/search` request body for Serper. Pure, for tests. */
export function buildSerperSearchBody(query, limit, hints) {
    let q = hints?.cleanQuery ? hints.cleanQuery : query;
    // Append domain constraints
    if (hints?.domains?.include?.length) {
        q = `${q} site:${hints.domains.include[0]}`;
    }
    if (hints?.domains?.exclude?.length) {
        for (const d of hints.domains.exclude) {
            q = `${q} -site:${d}`;
        }
    }
    const body = {
        q: q.trim(),
        num: Math.min(Math.max(limit, 1), SERPER_MAX_RESULTS),
    };
    const tbs = mapSerperFreshness(hints);
    if (tbs)
        body.tbs = tbs;
    if (hints?.locale?.country) {
        body.gl = hints.locale.country.toLowerCase();
    }
    if (hints?.locale?.language) {
        body.hl = hints.locale.language.toLowerCase();
    }
    return body;
}
/** Extract answerBox answer or knowledgeGraph description as top-level content. */
export function extractSerperContent(body) {
    if (!body || typeof body !== "object")
        return undefined;
    const b = body;
    if (b.answerBox && typeof b.answerBox === "object") {
        const ab = b.answerBox;
        const ans = typeof ab.answer === "string" ? ab.answer : typeof ab.snippet === "string" ? ab.snippet : "";
        if (ans.trim())
            return ans.trim();
    }
    if (b.knowledgeGraph && typeof b.knowledgeGraph === "object") {
        const kg = b.knowledgeGraph;
        const desc = typeof kg.description === "string" ? kg.description : "";
        if (desc.trim()) {
            const title = typeof kg.title === "string" ? kg.title : "";
            return title ? `${title}: ${desc.trim()}` : desc.trim();
        }
    }
    return undefined;
}
/** Parse Serper's organic results & answer box into normalized Sources. */
export function parseSerperSearchJson(body, limit) {
    if (!body || typeof body !== "object")
        return [];
    const b = body;
    const sources = [];
    // 1. If an answer box exists with a usable link, include as first source
    if (b.answerBox && typeof b.answerBox === "object") {
        const ab = b.answerBox;
        const link = typeof ab.link === "string" ? ab.link : "";
        const title = typeof ab.title === "string" ? ab.title : "Google Quick Answer";
        const snippet = typeof ab.answer === "string" ? ab.answer : typeof ab.snippet === "string" ? ab.snippet : "";
        if (link && snippet) {
            sources.push({ url: link, title, snippet });
        }
    }
    // 2. Parse organic results
    const organic = b.organic;
    if (Array.isArray(organic)) {
        for (const item of organic) {
            if (sources.length >= limit)
                break;
            const url = typeof item?.link === "string" ? item.link : "";
            if (!url)
                continue;
            const s = { url };
            if (typeof item.title === "string" && item.title)
                s.title = item.title;
            let snippet = typeof item.snippet === "string" ? item.snippet : "";
            if (item.attributes && typeof item.attributes === "object") {
                const attrPairs = Object.entries(item.attributes)
                    .filter(([, v]) => typeof v === "string" && v.trim())
                    .map(([k, v]) => `${k}: ${v}`);
                if (attrPairs.length > 0) {
                    const attrText = attrPairs.join(" | ");
                    snippet = snippet ? `${snippet}\n${attrText}` : attrText;
                }
            }
            if (snippet)
                s.snippet = snippet;
            if (typeof item.date === "string" && item.date)
                s.publishedAt = item.date;
            sources.push(s);
        }
    }
    return sources;
}
export const SerperProvider = {
    ...SERPER_META,
    async search(query, maxResults, apiKey, baseUrl, contextOrSignal) {
        const { signal, hints } = resolveContext(contextOrSignal);
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Serper API key is not configured");
        const limit = Math.min(Math.max(maxResults ?? 5, 1), SERPER_MAX_RESULTS);
        const searchUrl = endpointViewOf("serper", { serper: baseUrl })?.url ?? SERPER_SEARCH_URL;
        const body = buildSerperSearchBody(query, limit, hints);
        const res = await fetchWithProxy(searchUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                accept: "application/json",
                "X-API-KEY": token,
            },
            body: JSON.stringify(body),
            signal,
        }, { provider: "serper" });
        throwIfHttp("Serper", res);
        let resBody;
        try {
            resBody = await res.json();
        }
        catch {
            throw providerError("invalid-response", "Serper returned a non-JSON search response");
        }
        const content = extractSerperContent(resBody);
        return {
            sources: parseSerperSearchJson(resBody, limit),
            ...(content ? { content } : {}),
        };
    },
    async fetch(_url, _apiKey, _baseUrl, _signal) {
        throw providerError("config", "Serper does not provide native fetch");
    },
};
