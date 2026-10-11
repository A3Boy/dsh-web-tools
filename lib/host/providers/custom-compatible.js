/**
 * dsh-web-tools — adapters for operator-defined custom search sources.
 *
 * One factory, three codecs:
 *  - `tavily-compatible` — POST a JSON body, read `results[]`.
 *  - `searxng-json`      — GET/POST form, read `results[]`, optional `answer`.
 *  - `generic-json`      — fully declarative request/response mapping.
 *
 * Everything a custom source can do is expressed as DATA. There is no
 * expression evaluator, no template engine, and no user-supplied script: the
 * only interpretation performed is {@link readMappingPath}, which reads own
 * properties along a pre-validated dotted path.
 *
 * Custom sources are search-only. `fetchCapable` is false by design — a
 * "Tavily compatible" gateway very often implements just `/search`, and
 * assuming it also implements `/extract` would silently send page URLs (and
 * the credential) to an endpoint that may not exist. Page fetching keeps using
 * the built-in generic fetcher.
 *
 * @module
 */
import { joinUrl } from "../endpoints.js";
import { parseMappingPath, readMappingPath } from "../custom-provider-schema.js";
import { TransportError, truncateUnicodeSafe, } from "../provider-transport.js";
import { providerError, resolveContext } from "./types.js";
import { PROTOCOL_DEFAULTS, } from "../../shared/custom-provider-types.js";
/** Map a transport failure onto a stable, UI-facing source error code. */
export function toSourceErrorCode(code) {
    switch (code) {
        case "invalid-url":
            return "invalid-url";
        case "destination-blocked":
        case "proxy-required":
            return "destination-blocked";
        case "timeout":
            return "timeout";
        case "invalid-response":
            return "invalid-response";
        case "config":
            return "config";
        default:
            return "network";
    }
}
/** Re-throw a transport failure as a classified ProviderError (never raw). */
function asProviderError(err, label) {
    if (err instanceof TransportError) {
        const code = toSourceErrorCode(err.code);
        throw providerError(providerCodeFor(code), `${label}: ${err.message}`, err.status);
    }
    throw err;
}
/**
 * Translate a UI-facing source code into the executor's ProviderErrorCode.
 * Kept explicit so fallback semantics (`auth` indicts a key, `rate-limit`
 * cools down) stay driven by the executor's own vocabulary.
 */
export function providerCodeFor(code) {
    switch (code) {
        case "auth":
            return "auth";
        case "timeout":
            return "timeout";
        case "network":
            return "network";
        case "config":
            return "config";
        case "invalid-response":
        case "mapping-error":
            return "invalid-response";
        default:
            // invalid-url / destination-blocked are terminal policy denials, not
            // retryable request problems.
            return "bad-request";
    }
}
/** Basic-auth header value (password may contain `:`, `,`, `;` — no splitting). */
export function basicAuthHeader(username, password) {
    return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}
/** Parameters actually sent, after static + dynamic merge. */
function mergeParams(config, query, maxResults) {
    const defaults = PROTOCOL_DEFAULTS[config.protocol];
    const queryField = config.request?.queryField ?? defaults?.queryField ?? "q";
    const limitField = config.request?.limitField ?? defaults?.limitField;
    const out = {};
    for (const [key, value] of Object.entries(config.request?.staticParams ?? {})) {
        out[key] = String(value);
    }
    out[queryField] = query;
    if (limitField && typeof maxResults === "number" && Number.isFinite(maxResults) && maxResults > 0) {
        out[limitField] = String(Math.floor(maxResults));
    }
    return out;
}
/**
 * Build the outbound request for one custom source.
 *
 * Encoding rules:
 *  - `query` → parameters in the query string (any method).
 *  - `json`  → parameters as a JSON body (POST; a GET would put the query in
 *              the URL, which is allowed but unusual — POST is used instead).
 *  - `form`  → `application/x-www-form-urlencoded` body (POST).
 *
 * The credential NEVER enters the query string for custom sources. The one
 * legacy exception in this codebase is the built-in SearXNG adapter's
 * `api_key` parameter, which predates this module and lives in its own file.
 */
export async function buildCustomRequest(config, deps, query, maxResults) {
    const headers = { accept: "application/json" };
    const params = mergeParams(config, query, maxResults);
    const base = joinUrl(config.endpoint.baseUrl, config.endpoint.searchPath);
    // ---- auth -------------------------------------------------------------
    switch (config.auth.mode) {
        case "none":
            break;
        case "bearer": {
            const token = (await deps.credentials.read(deps.refs.key ?? "")).trim();
            if (!token)
                throw providerError("config", `${config.name}: API key is not configured`);
            headers.authorization = `Bearer ${token}`;
            break;
        }
        case "api-key-header": {
            const token = (await deps.credentials.read(deps.refs.key ?? "")).trim();
            if (!token)
                throw providerError("config", `${config.name}: API key is not configured`);
            headers[(config.auth.headerName ?? "x-api-key").toLowerCase()] = token;
            break;
        }
        case "basic": {
            const username = await deps.credentials.read(deps.refs.username ?? "");
            const password = await deps.credentials.read(deps.refs.password ?? "");
            if (!username)
                throw providerError("config", `${config.name}: basic-auth username is not configured`);
            headers.authorization = basicAuthHeader(username, password);
            break;
        }
    }
    // ---- method + encoding ------------------------------------------------
    const method = config.endpoint.encoding === "query" ? config.endpoint.method : "POST";
    if (config.endpoint.encoding === "query") {
        const url = new URL(base);
        for (const [key, value] of Object.entries(params))
            url.searchParams.set(key, value);
        return { url: url.href, method, headers };
    }
    if (config.endpoint.encoding === "json") {
        headers["content-type"] = "application/json";
        return { url: base, method, headers, body: JSON.stringify(params) };
    }
    headers["content-type"] = "application/x-www-form-urlencoded";
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
        form.set(key, value);
    return { url: base, method, headers, body: form.toString() };
}
/** Distinguish a zero-result page from a structurally wrong one. */
export function mapCustomResponse(config, json, maxResults) {
    const mapping = config.response ?? PROTOCOL_DEFAULTS[config.protocol]?.response ?? {
        itemsPath: "results",
        urlPath: "url",
    };
    const itemsSegments = parseMappingPath(mapping.itemsPath, "response.itemsPath");
    const container = readMappingPath(json, itemsSegments);
    if (container === undefined || container === null) {
        // The required container is absent. That is a MAPPING failure, not "no
        // results" — conflating the two hides every misconfiguration behind an
        // empty success.
        throw providerError("invalid-response", `${config.name}: response has no value at itemsPath "${mapping.itemsPath}"`);
    }
    if (!Array.isArray(container)) {
        throw providerError("invalid-response", `${config.name}: itemsPath "${mapping.itemsPath}" is ${typeof container}, not an array`);
    }
    const urlSegments = parseMappingPath(mapping.urlPath, "response.urlPath");
    const titleSegments = mapping.titlePath ? parseMappingPath(mapping.titlePath, "response.titlePath", true) : [];
    const snippetSegments = mapping.snippetPath ? parseMappingPath(mapping.snippetPath, "response.snippetPath", true) : [];
    const publishedSegments = mapping.publishedAtPath
        ? parseMappingPath(mapping.publishedAtPath, "response.publishedAtPath", true)
        : [];
    const warnings = [];
    const sources = [];
    let dropped = 0;
    const limit = typeof maxResults === "number" && maxResults > 0 ? Math.floor(maxResults) : container.length;
    for (const item of container) {
        if (sources.length >= limit)
            break;
        if (item === null || typeof item !== "object") {
            dropped += 1;
            continue;
        }
        const rawUrl = readMappingPath(item, urlSegments);
        const url = normalizeResultUrl(rawUrl);
        if (!url) {
            dropped += 1;
            continue;
        }
        const source = { url };
        const title = readString(item, titleSegments);
        if (title)
            source.title = truncateUnicodeSafe(title);
        const snippet = readString(item, snippetSegments);
        if (snippet)
            source.snippet = truncateUnicodeSafe(snippet);
        const published = readString(item, publishedSegments);
        if (published)
            source.publishedAt = truncateUnicodeSafe(published, 128);
        sources.push(source);
    }
    if (dropped > 0)
        warnings.push(`${dropped} result(s) had no usable URL and were dropped`);
    if (sources.length === 0 && container.length > 0) {
        // Every entry was rejected: report where the mapping looked, so the
        // operator can fix the path instead of guessing.
        throw providerError("invalid-response", `${config.name}: none of the ${container.length} item(s) at "${mapping.itemsPath}" had a usable URL at urlPath "${mapping.urlPath}"`);
    }
    const result = { sources, warnings };
    if (mapping.answerPath) {
        const answer = readString(json, parseMappingPath(mapping.answerPath, "response.answerPath", true));
        if (answer)
            result.content = truncateUnicodeSafe(answer);
    }
    return result;
}
/** Read a string at a path (empty string when absent or not a string). */
function readString(root, segments) {
    if (segments.length === 0)
        return undefined;
    const value = readMappingPath(root, segments);
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
/** Accept only absolute http(s) result URLs. */
export function normalizeResultUrl(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    if (trimmed === "")
        return undefined;
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
            return undefined;
        return parsed.href;
    }
    catch {
        return undefined;
    }
}
// ---------------------------------------------------------------------------
// adapter factory
// ---------------------------------------------------------------------------
/** Build a ProviderAdapter for one persisted custom source. */
export function createCustomAdapter(config, deps) {
    const label = config.name;
    return {
        name: config.id,
        label: config.name,
        description: config.description ?? `Custom source (${config.protocol})`,
        credSuffix: `CUSTOM_${config.id.slice("custom_".length).toUpperCase()}`,
        fetchCapable: false,
        needsBaseUrl: false,
        async search(query, maxResults, apiKey, baseUrl, contextOrSignal) {
            const { signal, hints } = resolveContext(contextOrSignal);
            const effectiveQuery = hints?.cleanQuery ? hints.cleanQuery : query;
            void apiKey; // custom sources resolve their own credentials by ref
            void baseUrl;
            let built;
            try {
                built = await buildCustomRequest(config, deps, effectiveQuery, maxResults);
            }
            catch (err) {
                if (err && typeof err === "object" && "code" in err)
                    throw err;
                throw providerError("config", `${label}: ${err instanceof Error ? err.message : String(err)}`);
            }
            let response;
            try {
                response = await deps.transport({
                    url: built.url,
                    method: built.method,
                    headers: built.headers,
                    ...(built.body !== undefined ? { body: built.body } : {}),
                    label,
                    trust: deps.trust,
                    policy: deps.policy,
                    signal,
                });
            }
            catch (err) {
                asProviderError(err, label);
            }
            if (response.status === 401 || response.status === 403) {
                throw providerError("auth", `${label}: rejected the credential (HTTP ${response.status})`, response.status);
            }
            if (response.status === 429) {
                throw providerError("rate-limit", `${label}: rate limited (HTTP 429)`, 429);
            }
            if (response.status >= 500) {
                throw providerError("server", `${label}: server error (HTTP ${response.status})`, response.status);
            }
            if (!response.ok) {
                throw providerError("bad-request", `${label}: request failed (HTTP ${response.status})`, response.status);
            }
            if (response.truncated) {
                throw providerError("invalid-response", `${label}: response exceeded the size cap and was truncated before it could be parsed`);
            }
            if (response.json === undefined) {
                throw providerError("invalid-response", `${label}: expected a JSON body but received "${response.contentType || "unknown content type"}"`);
            }
            if (response.json === null || typeof response.json !== "object") {
                throw providerError("invalid-response", `${label}: response JSON is not an object or array`);
            }
            let mapped;
            try {
                mapped = mapCustomResponse(config, response.json, maxResults);
            }
            catch (err) {
                if (err && typeof err === "object" && "code" in err)
                    throw err;
                throw providerError("invalid-response", `${label}: ${err instanceof Error ? err.message : String(err)}`);
            }
            return mapped.content !== undefined
                ? { content: mapped.content, sources: mapped.sources }
                : { sources: mapped.sources };
        },
        async fetch() {
            // Custom sources are search-only; page fetching uses the built-in
            // generic fetcher, which owns its own SSRF guard and redirect handling.
            throw providerError("config", "Custom sources provide search only; page fetching uses the generic fetcher");
        },
    };
}
