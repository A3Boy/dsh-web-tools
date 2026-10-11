/**
 * dsh-web-tools — Custom Search Provider contract (Issue #9).
 *
 * A custom provider is a *declarative* description of one JSON search service:
 * how to reach it, how to authenticate, and how to map its response into the
 * normalized `SearchOutcome`. Nothing here is executable — no user-supplied
 * script, expression, or dynamic property access is ever evaluated.
 *
 * Two identifiers are deliberately kept separate:
 *  - `sourceId`  — one configured source instance (`custom_ab12cd34`). Owns its
 *                  credential, key pool, health and routing slot.
 *  - `protocol`  — how to speak to it (`tavily-compatible`, `searxng-json`,
 *                  `generic-json`). Only chooses the request/response codec.
 *
 * Several sources may share a protocol without sharing any runtime state.
 *
 * @module
 */
/** Maximum custom sources persisted in one profile. */
export const MAX_CUSTOM_PROVIDERS = 20;
/** Prefix every host-generated custom source id carries. */
export const CUSTOM_ID_PREFIX = "custom_";
export const PROTOCOL_DEFAULTS = {
    "tavily-compatible": {
        method: "POST",
        encoding: "json",
        searchPath: "/search",
        queryField: "query",
        limitField: "max_results",
        response: { itemsPath: "results", urlPath: "url", titlePath: "title", snippetPath: "content", publishedAtPath: "published_date", answerPath: "answer" },
    },
    "searxng-json": {
        method: "GET",
        encoding: "query",
        searchPath: "/search",
        queryField: "q",
        response: { itemsPath: "results", urlPath: "url", titlePath: "title", snippetPath: "content", publishedAtPath: "publishedDate", answerPath: "answer" },
    },
    "generic-json": {
        method: "GET",
        encoding: "query",
        searchPath: "/search",
        queryField: "q",
        limitField: "limit",
        response: { itemsPath: "results", urlPath: "url", titlePath: "title", snippetPath: "snippet" },
    },
};
/** Human labels for the protocol picker. */
export const PROTOCOL_LABELS = {
    "tavily-compatible": "Tavily Compatible",
    "searxng-json": "SearXNG JSON",
    "generic-json": "Generic JSON",
};
