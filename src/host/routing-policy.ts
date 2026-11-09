/**
 * dsh-web-tools — Search routing policy helpers.
 *
 * Three policies control which provider the runtime tries first for each
 * search query while keeping the deterministic fallback chain intact:
 *
 *  - ordered (default): always start from the first available provider.
 *  - round-robin: rotate the start offset by 1 per query.
 *  - random: pick a random start offset per query.
 *
 * web_fetch does NOT participate in routing — it follows the deterministic
 * fetch-capable chain because not every provider supports page extraction.
 * @module
 */

export type SearchRoutingPolicy =
  | "ordered"
  | "round-robin"
  | "random"
  | "adaptive"
  | "fastest"
  | "cheapest";

export interface ProviderMetrics {
  success: number;
  failed: number;
  avgLatencyMs: number;
}

/** Cost tier rating from 0 (free/self-hosted) to 3 (premium multi-step / scrape). */
export const PROVIDER_COST_TIERS: Record<string, number> = {
  searxng: 0,
  keenable: 1,
  brave: 1,
  serper: 1,
  tavily: 2,
  exa: 2,
  you: 2,
  jina: 2,
  parallel: 3,
  firecrawl: 3,
};

/** Mutable state for round-robin rotation across calls. */
export interface SearchRoutingState {
  nextRoundRobinIndex: number;
}

/**
 * Rotate or prioritize the base chain according to the current policy.
 * Returns a new array — the original is never mutated.
 */
export function resolveSearchChain(
  baseChain: string[],
  policy: SearchRoutingPolicy,
  state?: SearchRoutingState,
  random: () => number = Math.random,
  metricsByProvider?: Record<string, ProviderMetrics>,
): string[] {
  if (baseChain.length <= 1) return [...baseChain];

  if (policy === "ordered") return [...baseChain];

  if (policy === "cheapest") {
    // Rank by cost tier ascending (free self-hosted first)
    return [...baseChain].sort((a, b) => {
      const tierA = PROVIDER_COST_TIERS[a] ?? 2;
      const tierB = PROVIDER_COST_TIERS[b] ?? 2;
      return tierA - tierB;
    });
  }

  if (policy === "fastest" && metricsByProvider) {
    // Rank by average latency ascending; unmeasured backends go to the back
    return [...baseChain].sort((a, b) => {
      const mA = metricsByProvider[a];
      const mB = metricsByProvider[b];
      const latA = mA && mA.success > 0 ? mA.avgLatencyMs : 999999;
      const latB = mB && mB.success > 0 ? mB.avgLatencyMs : 999999;
      return latA - latB;
    });
  }

  if (policy === "adaptive" && metricsByProvider) {
    // Rank by composite score = 0.7 * successRate + 0.3 * (1 / log10(10 + latency))
    return [...baseChain].sort((a, b) => {
      const calcScore = (name: string) => {
        const m = metricsByProvider[name];
        if (!m || (m.success === 0 && m.failed === 0)) return 0.75; // neutral prior
        const total = m.success + m.failed;
        const successRate = m.success / total;
        const latency = m.avgLatencyMs > 0 ? m.avgLatencyMs : 500;
        const latencyScore = 1 / Math.log10(10 + latency);
        return successRate * 0.7 + latencyScore * 0.3;
      };
      return calcScore(b) - calcScore(a);
    });
  }

  let offset = 0;

  if (policy === "round-robin") {
    const st = state ?? { nextRoundRobinIndex: 0 };
    offset = st.nextRoundRobinIndex % baseChain.length;
    st.nextRoundRobinIndex = (st.nextRoundRobinIndex + 1) % baseChain.length;
  } else {
    offset = Math.floor(random() * baseChain.length);
  }

  return [...baseChain.slice(offset), ...baseChain.slice(0, offset)];
}