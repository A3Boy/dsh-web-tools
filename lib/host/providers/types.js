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
export function resolveContext(contextOrSignal) {
    if (!contextOrSignal)
        return {};
    if (typeof contextOrSignal === "object" && ("aborted" in contextOrSignal || "addEventListener" in contextOrSignal)) {
        return { signal: contextOrSignal };
    }
    const ctx = contextOrSignal;
    return {
        signal: ctx.signal,
        options: ctx.options,
    };
}
export const extractContext = resolveContext;
/**
 * Self-hosted provider that needs a base URL and has no Fetch API — and
 * therefore works WITHOUT an API key (currently only SearXNG). Keyed-hosted
 * providers always require a key.
 */
export function isKeylessSelfHosted(meta) {
    return meta.needsBaseUrl && !meta.fetchCapable;
}
/** Build a ProviderError with a classification code and optional retry-after metadata. */
export function providerError(code, message, status, retryAfterMs) {
    const err = new Error(message);
    err.code = code;
    if (status !== undefined)
        err.status = status;
    if (retryAfterMs !== undefined && retryAfterMs > 0)
        err.retryAfterMs = retryAfterMs;
    return err;
}
/**
 * Parse the `Retry-After` response header into milliseconds from now.
 * Supports:
 *  - `Retry-After: 30` (delta-seconds)
 *  - `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT` (HTTP-date)
 * Returns undefined when the header is absent or unparseable.
 */
export function parseRetryAfter(res, now = Date.now()) {
    const raw = res.headers.get("retry-after");
    if (!raw)
        return undefined;
    const trimmed = raw.trim();
    // Try delta-seconds first
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
    }
    // Try HTTP-date
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
        return Math.max(0, parsed - now);
    }
    return undefined;
}
/**
 * Throw a classified ProviderError from a non-OK HTTP response, with a
 * provider label for the message. Every adapter uses this — no per-adapter
 * status mapping. Retry-After header is parsed and attached to rate-limit errors.
 */
export function throwIfHttp(label, res) {
    if (res.ok)
        return;
    const code = classifyHttpStatus(res.status);
    const retryAfterMs = code === "rate-limit" ? parseRetryAfter(res) : undefined;
    throw providerError(code, `${label} failed (HTTP ${res.status}, ${code})`, res.status, retryAfterMs);
}
