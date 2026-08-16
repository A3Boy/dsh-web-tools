/**
 * dsh-web-tools — provider registry.
 * @module
 */
import { BraveProvider, braveQuota } from "./brave.ts";
import { ExaProvider } from "./exa.ts";
import { FirecrawlProvider } from "./firecrawl.ts";
import { JinaProvider, jinaQuota } from "./jina.ts";
import { ParallelProvider } from "./parallel.ts";
import { SearxngProvider } from "./searxng.ts";
import { TavilyProvider } from "./tavily.ts";
import { YouProvider, youQuota } from "./you.ts";
import type { QuotaProvider, QuotaSnapshot } from "../quota.ts";
import { dashboardOnlyQuota, localEstimateQuota, selfHostedQuota } from "../quota.ts";
import { tavilyQuota } from "./tavily-quota.ts";
import { firecrawlQuota } from "./firecrawl-quota.ts";
import type { ProviderAdapter, ProviderError } from "./types.ts";
import { providerError } from "./types.ts";

/** Adapter + optional quota reporter. */
export interface ProviderWithQuota extends ProviderAdapter {
  quota?: QuotaProvider["quota"];
}

/** All built-in adapters, keyed by name. */
export const PROVIDERS: Record<string, ProviderWithQuota> = {
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
export const PROVIDER_LIST: ProviderWithQuota[] = [
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
export function getProvider(name: string): ProviderWithQuota {
  const p = PROVIDERS[name];
  if (!p) throw providerError("config", `Unknown provider "${name}"`);
  return p;
}

/**
 * Fetch a provider's quota snapshot with sensible defaults for providers
 * without a quota API (never throws for unsupported providers).
 */
export async function quotaOf(
  providerName: string,
  apiKey: string,
  baseUrl: string | undefined,
  localUsdCents?: number,
  signal?: AbortSignal,
): Promise<QuotaSnapshot> {
  const p = getProvider(providerName);
  if (p.quota) {
    if (!apiKey && p.needsBaseUrl) return selfHostedQuota("Self-hosted — no platform quota");
    return p.quota(apiKey, baseUrl, signal);
  }
  if (p.needsBaseUrl) return selfHostedQuota("Self-hosted — no platform quota");
  if (localUsdCents !== undefined) {
    return localEstimateQuota(localUsdCents, "Estimated local usage — official balance lives in the provider dashboard");
  }
  return dashboardOnlyQuota("Balance is available in the provider dashboard only");
}

/** Credential ref for one provider ("WEB_TOOLS_TAVILY"). */
export function credRefOf(providerName: string): string {
  const p = getProvider(providerName);
  return `WEB_TOOLS_${p.credSuffix}`;
}

export { providerError };
export type { ProviderError, ProviderAdapter, SearchOutcome, Source } from "./types.ts";
