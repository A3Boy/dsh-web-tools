/**
 * dsh-web-tools — dynamic provider catalog (Issue #9).
 *
 * The built-in adapter map `PROVIDERS` is a module-level constant and is never
 * mutated. Instead every search resolves an immutable *snapshot* that layers
 * the operator's custom sources on top of the built-ins:
 *
 *   1. a search reads ONE snapshot at the start;
 *   2. routing, credentials, endpoints and adapters are all taken from it;
 *   3. later config edits are visible only to the NEXT search.
 *
 * That last property is what makes hot-adding a source safe: deleting or
 * editing a source can never pull an adapter out from under a request that is
 * already in flight.
 *
 * @module
 */
import { endpointViewOf, isForeignOverride, PROVIDER_ENDPOINTS, SELF_HOSTED_PROVIDERS } from "./endpoints.js";
import { credentialRefsOf } from "./custom-provider-schema.js";
import { createCustomAdapter } from "./providers/custom-compatible.js";
import { PROVIDERS } from "./providers/index.js";
import { DEFAULT_MAX_RESPONSE_BYTES, OUTBOUND_AUTHORIZATIONS, } from "./provider-transport.js";
export { OUTBOUND_AUTHORIZATIONS } from "./provider-transport.js";
/**
 * Order custom source ids after built-ins deterministically.
 * Ids are random, so a stable sort keeps routing order reproducible across
 * restarts instead of following insertion accidents.
 */
function sortCustom(configs) {
    return [...configs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
/** Build the default policy for a built-in provider's own official endpoint. */
function builtInPolicy() {
    return {
        // Built-ins dial their own hardcoded official URL; allowProxy preserves the
        // long-standing behavior of tunneling provider APIs through a proxy.
        authorizations: [],
        allowProxy: true,
        maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
    };
}
/**
 * Build the outbound policy for one custom source.
 *
 * A source whose configured base URL sits on the SAME host as a known official
 * endpoint keeps proxy support (the credential is going where it always went).
 * A source pointing anywhere else — a self-hosted instance, a company gateway,
 * a third-party proxy — must not be reached through an ambient HTTP proxy:
 * the policy then requires an explicit authorization, so a misconfigured proxy
 * fails closed instead of quietly forwarding the credential to whoever
 * terminates the proxy.
 */
export function policyForCustomSource(config, authorizations) {
    const parsed = new URL(config.endpoint.baseUrl);
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
    const host = parsed.hostname.toLowerCase();
    const authorization = authorizations.find((entry) => (entry.host.toLowerCase().replace(/^\[|\]$/g, "") === host ||
        (entry.host.startsWith(".") && (host === entry.host.slice(1) || host.endsWith(entry.host.toLowerCase())))) &&
        (entry.port === undefined || entry.port === port));
    const officialHosts = Object.values(PROVIDER_ENDPOINTS)
        .flatMap((table) => [table.search.host, ...Object.values(table.extra ?? {}).map((e) => e.host)])
        .map((h) => h.toLowerCase());
    if (authorization) {
        return {
            policy: { authorizations: [...authorizations], allowProxy: false, maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES },
            trust: "authorized",
        };
    }
    if (officialHosts.includes(host)) {
        return { policy: { authorizations: [], allowProxy: true, maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES }, trust: "public" };
    }
    // Unauthorized third-party/gateway target: still permitted when it is a
    // public https host, but never through a proxy.
    return {
        policy: { authorizations: [], allowProxy: false, maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES },
        trust: "public",
    };
}
/**
 * Assemble one snapshot.
 *
 * Built-ins keep their existing adapter identity, so their behavior (native
 * protocol handling, SearchHints, error classification, quota) is untouched.
 * Only the search endpoint they dial changes, and only when the operator set
 * an override — {@link endpointViewOf} guarantees an unset override resolves
 * to the exact official URL.
 */
export function buildProviderSnapshot(inputs) {
    const authorizations = inputs.authorizations ?? OUTBOUND_AUTHORIZATIONS;
    const entries = new Map();
    for (const [name, adapter] of Object.entries(PROVIDERS)) {
        const endpoint = endpointViewOf(name, inputs.providerBaseUrls);
        entries.set(name, {
            sourceId: name,
            builtIn: true,
            adapter,
            refs: { key: `WEB_TOOLS_${adapter.credSuffix}` },
            keyless: SELF_HOSTED_PROVIDERS.has(name) && !adapter.fetchCapable,
            trust: "official",
            policy: builtInPolicy(),
            ...(endpoint
                ? {
                    endpoint: {
                        defaultBaseUrl: endpoint.defaultBaseUrl,
                        effectiveBaseUrl: endpoint.effectiveBaseUrl,
                        isOverridden: endpoint.isOverridden,
                    },
                }
                : {}),
        });
    }
    for (const config of sortCustom(inputs.customProviders)) {
        // A custom source may not shadow a built-in id: it would silently take over
        // that provider's routing slot, credential ref and health record.
        if (entries.has(config.id))
            continue;
        const { policy, trust } = policyForCustomSource(config, authorizations);
        const refs = credentialRefsOf(config.id, config.auth.mode);
        entries.set(config.id, {
            sourceId: config.id,
            builtIn: false,
            adapter: createCustomAdapter(config, {
                transport: inputs.transport,
                credentials: inputs.credentials,
                refs,
                policy,
                trust,
            }),
            refs,
            keyless: config.auth.mode === "none",
            trust,
            policy,
            endpoint: {
                defaultBaseUrl: config.endpoint.baseUrl,
                effectiveBaseUrl: config.endpoint.baseUrl,
                isOverridden: false,
            },
            config,
        });
    }
    return {
        get: (sourceId) => entries.get(sourceId),
        list: () => [...entries.values()],
        has: (sourceId) => entries.has(sourceId),
    };
}
/**
 * Whether editing a built-in's base URL moves its credential to a different
 * service. The settings card uses this to require explicit confirmation, so an
 * existing API key is never silently sent to a third-party host.
 */
export function isForeignBuiltInOverride(providerName, baseUrl) {
    return isForeignOverride(providerName, baseUrl);
}
