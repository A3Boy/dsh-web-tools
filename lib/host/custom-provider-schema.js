/**
 * dsh-web-tools — server-side validation for custom search sources.
 *
 * Every field crossing the `/web-tools/api` boundary passes through here before
 * it is persisted or dialed. The rules exist to keep a custom source a
 * *declarative search client* and never a general-purpose request tool:
 *
 *  - the endpoint is an absolute http(s) URL with no userinfo/query/fragment;
 *  - `searchPath` is relative (an absolute URL there would let a caller point
 *    the credential at a host that the base-URL policy never authorized);
 *  - mapping paths are plain dotted identifiers or numeric indexes — no
 *    expressions, functions, or prototype-walking keys;
 *  - `staticParams` is a bounded flat map of primitives.
 *
 * @module
 */
import { CUSTOM_ID_PREFIX, MAX_CUSTOM_PROVIDERS, PROTOCOL_DEFAULTS, } from "../shared/custom-provider-types.js";
/** Thrown for any invalid field; `path` names the offending field. */
export class CustomProviderValidationError extends Error {
    code = "config";
    path;
    constructor(path, message) {
        super(`${path}: ${message}`);
        this.name = "CustomProviderValidationError";
        this.path = path;
    }
}
const PROTOCOLS = new Set(["tavily-compatible", "searxng-json", "generic-json"]);
const AUTH_MODES = new Set(["none", "bearer", "api-key-header", "basic"]);
const METHODS = new Set(["GET", "POST"]);
const ENCODINGS = new Set(["query", "json", "form"]);
const MAX_NAME_CHARS = 64;
const MAX_DESCRIPTION_CHARS = 256;
const MAX_PATH_CHARS = 512;
const MAX_MAPPING_SEGMENTS = 12;
const MAX_STATIC_PARAMS = 24;
const MAX_STATIC_PARAM_KEY_CHARS = 64;
const MAX_STATIC_PARAM_STRING_CHARS = 512;
/**
 * Prototype-polluting member names. A mapping path must never reach these:
 * `__proto__.x` walks the prototype chain, and `constructor`/`prototype` are
 * the classic escape hatches for a JSON-path evaluator.
 */
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype", "toString", "valueOf"]);
/**
 * Parse a restricted dotted path into segments.
 *
 * Accepted: `results`, `data.results`, `data.0.items`, `0.url`.
 * Rejected: anything with brackets, whitespace, quotes, expressions, empty
 * segments, or a forbidden member name.
 *
 * @throws {CustomProviderValidationError}
 */
export function parseMappingPath(path, field, allowEmpty = false) {
    if (typeof path !== "string")
        throw new CustomProviderValidationError(field, "must be a string");
    const trimmed = path.trim();
    if (trimmed === "") {
        if (allowEmpty)
            return [];
        throw new CustomProviderValidationError(field, "must not be empty");
    }
    if (trimmed.length > MAX_PATH_CHARS) {
        throw new CustomProviderValidationError(field, `must be at most ${MAX_PATH_CHARS} characters`);
    }
    if (/[[\]()'"`\\$*?|{}=!<>+~^@#%&:;,\s]/.test(trimmed)) {
        throw new CustomProviderValidationError(field, "must be a plain dotted path of identifiers and numeric indexes (no brackets, quotes, or expressions)");
    }
    const raw = trimmed.split(".");
    if (raw.length > MAX_MAPPING_SEGMENTS) {
        throw new CustomProviderValidationError(field, `must have at most ${MAX_MAPPING_SEGMENTS} segments`);
    }
    return raw.map((segment) => {
        if (segment === "")
            throw new CustomProviderValidationError(field, "contains an empty path segment");
        if (FORBIDDEN_SEGMENTS.has(segment)) {
            throw new CustomProviderValidationError(field, `segment "${segment}" is not allowed`);
        }
        if (/^\d+$/.test(segment)) {
            const index = Number(segment);
            if (!Number.isSafeInteger(index))
                throw new CustomProviderValidationError(field, "has an out-of-range index");
            return index;
        }
        if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(segment)) {
            throw new CustomProviderValidationError(field, `segment "${segment}" is not a plain identifier`);
        }
        return segment;
    });
}
/**
 * Read one value out of a parsed JSON document by a restricted path.
 * Only own properties are read, and only one level is descended per segment —
 * there is no evaluation of any kind.
 */
export function readMappingPath(root, segments) {
    let cursor = root;
    for (const segment of segments) {
        if (cursor === null || cursor === undefined)
            return undefined;
        if (typeof segment === "number") {
            if (!Array.isArray(cursor))
                return undefined;
            cursor = cursor[segment];
        }
        else {
            if (typeof cursor !== "object" || Array.isArray(cursor))
                return undefined;
            if (!Object.prototype.hasOwnProperty.call(cursor, segment))
                return undefined;
            cursor = cursor[segment];
        }
    }
    return cursor;
}
/** Validate a display string with a length bound. */
function validateText(value, field, max, required = true) {
    if (value === undefined || value === null) {
        if (required)
            throw new CustomProviderValidationError(field, "is required");
        return undefined;
    }
    if (typeof value !== "string")
        throw new CustomProviderValidationError(field, "must be a string");
    const trimmed = value.trim();
    if (trimmed === "") {
        if (required)
            throw new CustomProviderValidationError(field, "must not be empty");
        return undefined;
    }
    if (trimmed.length > max)
        throw new CustomProviderValidationError(field, `must be at most ${max} characters`);
    return trimmed;
}
/**
 * Validate a base URL: absolute http(s), no userinfo, no query, no fragment.
 * A query or fragment in a *base* is always an operator mistake and a good way
 * to smuggle unexpected parameters past the request builder.
 */
export function validateBaseUrl(value, field = "endpoint.baseUrl") {
    const text = validateText(value, field, MAX_PATH_CHARS);
    let parsed;
    try {
        parsed = new URL(text);
    }
    catch {
        throw new CustomProviderValidationError(field, "must be an absolute http(s) URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new CustomProviderValidationError(field, "must use the http or https scheme");
    }
    if (parsed.username || parsed.password) {
        throw new CustomProviderValidationError(field, "must not embed userinfo credentials");
    }
    if (parsed.search)
        throw new CustomProviderValidationError(field, "must not contain a query string");
    if (parsed.hash)
        throw new CustomProviderValidationError(field, "must not contain a fragment");
    return parsed.href.replace(/\/+$/, "");
}
/** Validate `searchPath`: relative, no scheme, no query, no traversal. */
export function validateSearchPath(value, field = "endpoint.searchPath") {
    const text = validateText(value, field, MAX_PATH_CHARS);
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith("//")) {
        throw new CustomProviderValidationError(field, "must be a relative path, not an absolute URL");
    }
    if (text.includes("?") || text.includes("#")) {
        throw new CustomProviderValidationError(field, "must not contain a query string or fragment");
    }
    if (text.includes("..")) {
        throw new CustomProviderValidationError(field, "must not contain path traversal segments");
    }
    return text;
}
/** Validate the endpoint block. */
export function validateEndpoint(value) {
    if (typeof value !== "object" || value === null) {
        throw new CustomProviderValidationError("endpoint", "is required");
    }
    const raw = value;
    const method = raw.method;
    if (typeof method !== "string" || !METHODS.has(method)) {
        throw new CustomProviderValidationError("endpoint.method", "must be GET or POST");
    }
    const encoding = raw.encoding;
    if (typeof encoding !== "string" || !ENCODINGS.has(encoding)) {
        throw new CustomProviderValidationError("endpoint.encoding", "must be query, json, or form");
    }
    return {
        baseUrl: validateBaseUrl(raw.baseUrl),
        searchPath: validateSearchPath(raw.searchPath),
        method: method,
        encoding: encoding,
    };
}
/** Validate the auth block. */
export function validateAuth(value) {
    if (typeof value !== "object" || value === null) {
        throw new CustomProviderValidationError("auth", "is required");
    }
    const raw = value;
    const mode = raw.mode;
    if (typeof mode !== "string" || !AUTH_MODES.has(mode)) {
        throw new CustomProviderValidationError("auth.mode", "must be none, bearer, api-key-header, or basic");
    }
    if (mode === "api-key-header") {
        const name = validateText(raw.headerName, "auth.headerName", 64);
        // Reuse the transport's token rule so a name accepted here is always
        // settable on the wire.
        if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
            throw new CustomProviderValidationError("auth.headerName", "is not a valid HTTP header name");
        }
        if (["host", "connection", "content-length", "transfer-encoding"].includes(name.toLowerCase())) {
            throw new CustomProviderValidationError("auth.headerName", "is a reserved header and cannot be used");
        }
        return { mode: mode, headerName: name };
    }
    return { mode: mode };
}
/** Validate the optional request-mapping block. */
export function validateRequest(value, protocol) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== "object")
        throw new CustomProviderValidationError("request", "must be an object");
    const raw = value;
    const defaults = PROTOCOL_DEFAULTS[protocol];
    const queryField = validateText(raw.queryField ?? defaults.queryField, "request.queryField", 64);
    const limitField = raw.limitField === undefined || raw.limitField === null || raw.limitField === ""
        ? defaults.limitField
        : validateText(raw.limitField, "request.limitField", 64);
    const staticParams = validateStaticParams(raw.staticParams);
    return {
        queryField: queryField,
        ...(limitField ? { limitField } : {}),
        ...(staticParams ? { staticParams } : {}),
    };
}
/** Validate `staticParams`: flat, bounded, primitives only. */
export function validateStaticParams(value) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== "object" || Array.isArray(value)) {
        throw new CustomProviderValidationError("request.staticParams", "must be an object");
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_STATIC_PARAMS) {
        throw new CustomProviderValidationError("request.staticParams", `must have at most ${MAX_STATIC_PARAMS} entries`);
    }
    const out = {};
    for (const [key, raw] of entries) {
        if (key.length === 0 || key.length > MAX_STATIC_PARAM_KEY_CHARS) {
            throw new CustomProviderValidationError("request.staticParams", `key length must be 1-${MAX_STATIC_PARAM_KEY_CHARS}`);
        }
        if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
            throw new CustomProviderValidationError("request.staticParams", `key "${key}" has unsupported characters`);
        }
        if (typeof raw === "string") {
            if (raw.length > MAX_STATIC_PARAM_STRING_CHARS) {
                throw new CustomProviderValidationError("request.staticParams", `value for "${key}" is too long`);
            }
            out[key] = raw;
        }
        else if (typeof raw === "number") {
            if (!Number.isFinite(raw))
                throw new CustomProviderValidationError("request.staticParams", `value for "${key}" must be finite`);
            out[key] = raw;
        }
        else if (typeof raw === "boolean") {
            out[key] = raw;
        }
        else {
            throw new CustomProviderValidationError("request.staticParams", `value for "${key}" must be a string, number, or boolean`);
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
/** Validate the response-mapping block, falling back to protocol defaults. */
export function validateResponse(value, protocol) {
    const defaults = PROTOCOL_DEFAULTS[protocol].response;
    if (value === undefined || value === null)
        return { ...defaults };
    if (typeof value !== "object")
        throw new CustomProviderValidationError("response", "must be an object");
    const raw = value;
    const itemsPath = validateText(raw.itemsPath ?? defaults.itemsPath, "response.itemsPath", MAX_PATH_CHARS);
    const urlPath = validateText(raw.urlPath ?? defaults.urlPath, "response.urlPath", MAX_PATH_CHARS);
    // Parse eagerly: a path that cannot be parsed must never be persisted.
    parseMappingPath(itemsPath, "response.itemsPath");
    parseMappingPath(urlPath, "response.urlPath");
    const optional = (key) => {
        const candidate = raw[key] ?? defaults[key];
        if (candidate === undefined || candidate === null || candidate === "")
            return undefined;
        const text = validateText(candidate, `response.${key}`, MAX_PATH_CHARS, false);
        if (text === undefined)
            return undefined;
        parseMappingPath(text, `response.${key}`, true);
        return text;
    };
    const titlePath = optional("titlePath");
    const snippetPath = optional("snippetPath");
    const publishedAtPath = optional("publishedAtPath");
    const answerPath = optional("answerPath");
    return {
        itemsPath,
        urlPath,
        ...(titlePath ? { titlePath } : {}),
        ...(snippetPath ? { snippetPath } : {}),
        ...(publishedAtPath ? { publishedAtPath } : {}),
        ...(answerPath ? { answerPath } : {}),
    };
}
/** Validate a protocol id. */
export function validateProtocol(value) {
    if (typeof value !== "string" || !PROTOCOLS.has(value)) {
        throw new CustomProviderValidationError("protocol", "must be tavily-compatible, searxng-json, or generic-json");
    }
    return value;
}
/**
 * Validate a host-generated source id.
 * Only ids matching the host's own format are ever accepted from a client, so
 * a caller cannot make the host derive a credential ref of its choosing.
 */
export function validateSourceId(value) {
    if (typeof value !== "string" || !/^custom_[a-z0-9]{8,32}$/.test(value)) {
        throw new CustomProviderValidationError("id", "is not a valid custom source id");
    }
    return value;
}
/**
 * Validate a full draft coming from the editor (no id or revision yet).
 * @throws {CustomProviderValidationError}
 */
export function validateDraft(value, sourceField = "source") {
    if (typeof value !== "object" || value === null) {
        throw new CustomProviderValidationError(sourceField, "is required");
    }
    const raw = value;
    const protocol = validateProtocol(raw.protocol);
    const name = validateText(raw.name, `${sourceField}.name`, MAX_NAME_CHARS);
    const description = validateText(raw.description, `${sourceField}.description`, MAX_DESCRIPTION_CHARS, false);
    const request = validateRequest(raw.request, protocol);
    return {
        name,
        ...(description ? { description } : {}),
        enabled: raw.enabled === true,
        protocol,
        endpoint: validateEndpoint(raw.endpoint),
        auth: validateAuth(raw.auth),
        ...(request ? { request } : {}),
        response: validateResponse(raw.response, protocol),
    };
}
/** Validate a persisted config read back from settings (defensive on load). */
export function validateStoredConfig(value) {
    try {
        const raw = value;
        if (!raw || typeof raw !== "object")
            return undefined;
        const id = validateSourceId(raw.id);
        const draft = validateDraft(raw, "stored");
        const revision = typeof raw.revision === "number" && Number.isInteger(raw.revision) && raw.revision > 0 ? raw.revision : 1;
        return { schemaVersion: 1, id, revision, ...draft };
    }
    catch {
        return undefined;
    }
}
/**
 * Load and sanitize the persisted custom-provider list.
 * A single malformed entry is dropped rather than failing the whole load, so
 * a bad hand-edit cannot make the plugin unavailable.
 */
export function loadCustomProviders(value, limit = MAX_CUSTOM_PROVIDERS) {
    if (!Array.isArray(value))
        return [];
    const out = [];
    const seen = new Set();
    for (const entry of value) {
        const parsed = validateStoredConfig(entry);
        if (!parsed)
            continue;
        if (seen.has(parsed.id))
            continue; // ids are unique and never reused
        seen.add(parsed.id);
        out.push(parsed);
        if (out.length >= limit)
            break;
    }
    return out;
}
/**
 * Credential refs for one custom source. Host-derived from the source id, so a
 * client can never name an arbitrary credential ref.
 *
 * `basic` uses two refs rather than the legacy `user:password` joined string:
 * the shared pool splits on `,`, `;` and whitespace, which would corrupt a
 * password containing any of those characters.
 */
export function credentialRefsOf(sourceId, mode) {
    const suffix = sourceId.slice(CUSTOM_ID_PREFIX.length).toUpperCase();
    const base = `WEB_TOOLS_CUSTOM_${suffix}`;
    if (mode === "basic")
        return { username: `${base}_USER`, password: `${base}_PASS` };
    if (mode === "none")
        return {};
    return { key: base };
}
/** Every credential ref that must be cleaned up when a source is deleted. */
export function allCredentialRefsOf(sourceId) {
    const suffix = sourceId.slice(CUSTOM_ID_PREFIX.length).toUpperCase();
    return [
        `WEB_TOOLS_CUSTOM_${suffix}`,
        `WEB_TOOLS_CUSTOM_${suffix}_USER`,
        `WEB_TOOLS_CUSTOM_${suffix}_PASS`,
    ];
}
/** Generate a host-owned, never-reused source id. */
export function generateSourceId(existing, random = Math.random) {
    const taken = new Set(existing);
    for (let attempt = 0; attempt < 64; attempt += 1) {
        const bytes = new Uint8Array(8);
        for (let i = 0; i < bytes.length; i += 1)
            bytes[i] = Math.floor(random() * 256);
        const id = `${CUSTOM_ID_PREFIX}${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
        if (!taken.has(id))
            return id;
    }
    // Deterministic-unique fallback (a 2^-64 collision is already implausible).
    return `${CUSTOM_ID_PREFIX}${Date.now().toString(16)}${Math.floor(random() * 0xffff).toString(16)}`;
}
