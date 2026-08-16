/**
 * dsh-web-tools — provider registry.
 * @module
 */
import { BraveProvider, braveQuota } from "./brave.js";
import { ExaProvider } from "./exa.js";
import { FirecrawlProvider } from "./firecrawl.js";
import { JinaProvider, jinaQuota } from "./jina.js";
import { ParallelProvider } from "./parallel.js";
import { SearxngProvider } from "./searxng.js";
import { TavilyProvider } from "./tavily.js";
import { YouProvider, youQuota } from "./you.js";
import { dashboardOnlyQuota, localEstimateQuota, selfHostedQuota } from "../quota.js";
import { tavilyQuota } from "./tavily-quota.js";
import { firecrawlQuota } from "./firecrawl-quota.js";
import { providerError } from "./types.js";
/** All built-in adapters, keyed by name. */
export const PROVIDERS = {
    tavily: { ...TavilyProvider, quota: (key, _base, signal) => tavilyQuota(key, signal) },
    exa: ExaProvider,
    firecrawl: { ...FirecrawlProvider, quota: (key, _base, signal) => firecrawlQuota(key, signal) },
    // Parallel has no balance endpoint a normal API key can call — usage and
    // spend live in the Platform dashboard. An explicit dashboard-only
    // reporter keeps quotaOf() from falling back to the generic local USD
    // estimate (which is priced for Exa and would be wrong for Parallel).
    parallel: {
        ...ParallelProvider,
        quota: () => Promise.resolve(dashboardOnlyQuota("Usage and spend live in the Parallel Platform dashboard")),
    },
    brave: { ...BraveProvider, quota: (key, _base, signal) => braveQuota(key, _base, signal) },
    you: { ...YouProvider, quota: (key, _base, signal) => youQuota(key, signal) },
    jina: { ...JinaProvider, quota: (key, _base, signal) => jinaQuota(key, signal) },
    searxng: SearxngProvider,
};
/** Ordered adapter list for UI/fallback iteration. */
export const PROVIDER_LIST = [
    TavilyProvider,
    ExaProvider,
    FirecrawlProvider,
    ParallelProvider,
    BraveProvider,
    YouProvider,
    JinaProvider,
    SearxngProvider,
];
/** Look up an adapter; throws a classified config error when unknown. */
export function getProvider(name) {
    const p = PROVIDERS[name];
    if (!p)
        throw providerError("config", `Unknown provider "${name}"`);
    return p;
}
/**
 * Fetch a provider's quota snapshot with sensible defaults for providers
 * without a quota API (never throws for unsupported providers).
 */
export async function quotaOf(providerName, apiKey, baseUrl, localUsdCents, signal) {
    const p = getProvider(providerName);
    if (p.quota) {
        if (!apiKey && p.needsBaseUrl)
            return selfHostedQuota("Self-hosted — no platform quota");
        return p.quota(apiKey, baseUrl, signal);
    }
    if (p.needsBaseUrl)
        return selfHostedQuota("Self-hosted — no platform quota");
    if (localUsdCents !== undefined) {
        return localEstimateQuota(localUsdCents, "Estimated local usage — official balance lives in the provider dashboard");
    }
    return dashboardOnlyQuota("Balance is available in the provider dashboard only");
}
/** Credential ref for one provider ("WEB_TOOLS_TAVILY"). */
export function credRefOf(providerName) {
    const p = getProvider(providerName);
    return `WEB_TOOLS_${p.credSuffix}`;
}
export { providerError };
