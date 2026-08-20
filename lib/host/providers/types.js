/**
 * dsh-web-tools — provider adapter contract.
 *
 * Each adapter implements search (and optionally fetch) for one backend,
 * normalized to DSH's `WebSearchResult` shape. Adapters own their HTTP
 * calls and SSRF guards; the registry owns pools and fallback.
 * @module
 */
/**
 * Classify an HTTP status uniformly across every adapter. Single source of
 * truth for fallback semantics; adapters must NOT hand-roll their own mapping.
 */
export function classifyHttpStatus(status) {
    if (status === 401 || status === 403)
        return "auth";
    if (status === 402)
        return "quota";
    if (status === 408)
        return "timeout";
    if (status === 429)
        return "rate-limit";
    if (status >= 500)
        return "server";
    return "bad-request";
}
/** Helper to extract signal and typed options from an execution context or bare signal. */
export function extractContext(contextOrSignal) {
    if (!contextOrSignal)
        return {};
    if (contextOrSignal instanceof AbortSignal)
        return { signal: contextOrSignal };
    return {
        signal: contextOrSignal.signal,
        options: contextOrSignal.options,
    };
}
/**
 * Self-hosted provider that needs a base URL and has no Fetch API — and
 * therefore works WITHOUT an API key (currently only SearXNG). Keyed-hosted
 * providers always require a key.
 */
export function isKeylessSelfHosted(meta) {
    return meta.needsBaseUrl && !meta.fetchCapable;
}
/** Build a ProviderError with a classification code. */
export function providerError(code, message, status) {
    const err = new Error(message);
    err.code = code;
    if (status !== undefined)
        err.status = status;
    return err;
}
/**
 * Throw a classified ProviderError from a non-OK HTTP response, with a
 * provider label for the message. Every adapter uses this — no per-adapter
 * status mapping.
 */
export function throwIfHttp(label, res) {
    if (res.ok)
        return;
    const code = classifyHttpStatus(res.status);
    const codeName = code;
    throw providerError(code, `${label} failed (HTTP ${res.status}, ${codeName})`, res.status);
}
