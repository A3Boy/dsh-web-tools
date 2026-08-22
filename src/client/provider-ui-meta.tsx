/**
 * dsh-web-tools — provider UI metadata: dashboard URLs and capability copy
 * keys, centralized so QuotaInline / ProviderModal / index.ts all read from
 * ONE source instead of scattering URLs across components.
 * @module
 */

/** Official dashboard / billing URL per provider (target=_blank links). */
export const PROVIDER_DASHBOARD: Record<string, { labelKey: string; url: string }> = {
  exa: { labelKey: "dashExa", url: "https://dashboard.exa.ai/billing" },
  parallel: { labelKey: "dashParallel", url: "https://platform.parallel.ai" },
  brave: { labelKey: "dashBrave", url: "https://api.search.brave.com/app/keys" },
  tavily: { labelKey: "dashTavily", url: "https://app.tavily.com/home" },
  firecrawl: { labelKey: "dashFirecrawl", url: "https://www.firecrawl.dev/app" },
  jina: { labelKey: "dashJina", url: "https://jina.ai" },
  you: { labelKey: "dashYou", url: "https://you.com/platform" },
};

/** Lookup a provider's dashboard entry; undefined for providers without one. */
export function dashboardOf(providerName?: string): { labelKey: string; url: string } | undefined {
  return providerName ? PROVIDER_DASHBOARD[providerName] : undefined;
}

/** Capability copy key per provider (locale dict holds the actual string). */
export const PROVIDER_CAPABILITY_KEY: Record<string, string> = {
  exa: "capability.exa",
  tavily: "capability.tavily",
  brave: "capability.brave",
  you: "capability.you",
  firecrawl: "capability.firecrawl",
  parallel: "capability.parallel",
  jina: "capability.jina",
  searxng: "capability.searxng",
};

/** External-link icon (local SVG; no Unicode ↗ which renders inconsistently). */
export function ExternalLinkIcon(props: { size?: number }) {
  const size = props.size ?? 12;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none", display: "inline-block", verticalAlign: "-1px" }}
      aria-hidden
    >
      <path d="M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3" />
      <path d="M9.5 2.5h4v4" />
      <path d="M13.5 2.5 7.5 8.5" />
    </svg>
  );
}