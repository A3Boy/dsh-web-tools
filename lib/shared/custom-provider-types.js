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
/** Classify a protocol into its primary access mode. */
export function accessModeOf(protocol) {
    if (protocol === "tavily-compatible")
        return "compatible";
    if (protocol === "searxng-json")
        return "template";
    return "custom";
}
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
        staticParams: { format: "json" },
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
export const CUSTOM_PRESETS = [
    {
        id: "serper",
        name: "Serper (Google Search)",
        description: "Google Search API via google.serper.dev",
        draft: {
            name: "Serper (Google)",
            enabled: true,
            protocol: "generic-json",
            endpoint: {
                baseUrl: "https://google.serper.dev",
                searchPath: "/search",
                method: "POST",
                encoding: "json",
            },
            auth: {
                mode: "api-key-header",
                headerName: "X-API-KEY",
            },
            request: {
                queryField: "q",
                limitField: "num",
            },
            response: {
                itemsPath: "organic",
                urlPath: "link",
                titlePath: "title",
                snippetPath: "snippet",
                publishedAtPath: "date",
            },
        },
    },
    {
        id: "searxng",
        name: "SearXNG (Meta Search)",
        description: "Self-hosted SearXNG JSON API",
        draft: {
            name: "SearXNG Search",
            enabled: true,
            protocol: "searxng-json",
            endpoint: {
                baseUrl: "http://127.0.0.1:8080",
                searchPath: "/search",
                method: "GET",
                encoding: "query",
            },
            auth: {
                mode: "none",
            },
            request: {
                queryField: "q",
                staticParams: { format: "json" },
            },
            response: {
                itemsPath: "results",
                urlPath: "url",
                titlePath: "title",
                snippetPath: "content",
                publishedAtPath: "publishedDate",
            },
        },
    },
    {
        id: "elasticsearch",
        name: "Elasticsearch / OpenSearch",
        description: "Cluster full-text index via /_search",
        draft: {
            name: "Elasticsearch Index",
            enabled: true,
            protocol: "generic-json",
            endpoint: {
                baseUrl: "http://127.0.0.1:9200",
                searchPath: "/_search",
                method: "POST",
                encoding: "json",
            },
            auth: {
                mode: "none",
            },
            request: {
                bodyTemplate: {
                    query: {
                        multi_match: {
                            query: "{{query}}",
                            fields: ["title", "content", "text"],
                        },
                    },
                    size: "{{maxResults}}",
                },
            },
            response: {
                itemsPath: "hits.hits",
                urlPath: "_source.url",
                titlePath: "_source.title",
                snippetPath: "_source.content",
            },
        },
    },
    {
        id: "tavily-proxy",
        name: "Tavily Compatible Gateway",
        description: "Self-hosted Tavily-compatible search gateway",
        draft: {
            name: "Tavily Gateway",
            enabled: true,
            protocol: "tavily-compatible",
            endpoint: {
                baseUrl: "http://127.0.0.1:8000",
                searchPath: "/search",
                method: "POST",
                encoding: "json",
            },
            auth: {
                mode: "bearer",
            },
            request: {
                queryField: "query",
                limitField: "max_results",
            },
            response: {
                itemsPath: "results",
                urlPath: "url",
                titlePath: "title",
                snippetPath: "content",
                publishedAtPath: "published_date",
                answerPath: "answer",
            },
        },
    },
];
