/**
 * dsh-web-tools — browser card: typed fetch client over the plugin's fenced
 * `/web-tools/api` routes.
 *
 * The browser never talks to provider APIs directly and never receives
 * credential values — only configured/writable state and quota snapshots
 * (which contain no secrets).
 * @module
 */
export const API_PREFIX = "/web-tools/api";
/** One wire failure. */
export class WebToolsApiError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
/** Call one API method; throws WebToolsApiError on failure. */
export async function call(method, payload) {
    let res;
    try {
        res = await fetch(`${API_PREFIX}/${method}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload ?? {}),
        });
    }
    catch (e) {
        throw new WebToolsApiError("network", `web-tools API unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
    let json;
    try {
        json = await res.json();
    }
    catch {
        throw new WebToolsApiError("bad-response", `web-tools API returned non-JSON (HTTP ${res.status})`);
    }
    const body = json;
    if (!body.ok || body.value === undefined) {
        throw new WebToolsApiError(body.error?.code ?? "error", body.error?.message ?? "web-tools API error");
    }
    return body.value;
}
export const api = {
    configGet: () => call("config/get"),
    configSave: (payload) => call("config/save", payload),
    credentialsDescribe: () => call("credentials/describe"),
    credentialsSet: (provider, value) => call("credentials/set", { provider, value }),
    credentialsAddKey: (provider, value) => call("credentials/add-key", { provider, value }),
    credentialsRemoveKey: (provider, keyId) => call("credentials/remove-key", { provider, keyId }),
    testProvider: (provider, query) => call("test/provider", { provider, query }),
    testSearch: (query) => call("test/search", { query }),
    quotaDescribe: (force = false) => call("quota/describe", { force }),
};
