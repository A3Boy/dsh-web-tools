/**
 * dsh-web-tools — Search routing policy helpers.
 *
 * Six policies control which order the runtime tries providers for each search
 * query while keeping the deterministic fallback chain intact:
 *
 *  - ordered (default): always start from the first available provider.
 *  - round-robin: rotate the start offset by 1 per query.
 *  - random: pick a random start offset per query.
 *  - adaptive: rank by a 24h success-rate / latency score.
 *  - fastest: rank by measured average latency.
 *  - cheapest: rank by the provider's cost tier.
 *
 * The metric-driven policies (adaptive/fastest) are ORDERING HINTS over the
 * configured chain, so a chain with no measurements must keep the operator's
 * order — never fall through to random rotation.
 *
 * web_fetch does NOT participate in routing — it follows the deterministic
 * fetch-capable chain because not every provider supports page extraction.
 * @module
 */
import type { SearchRoutingPolicy } from "../shared/api-types.ts";
export type { SearchRoutingPolicy } from "../shared/api-types.ts";
export interface ProviderMetrics {
    success: number;
    failed: number;
    avgLatencyMs: number;
}
/** Cost tier rating from 0 (free/self-hosted) to 3 (premium multi-step / scrape). */
export declare const PROVIDER_COST_TIERS: Record<string, number>;
/** Mutable state for round-robin rotation across calls. */
export interface SearchRoutingState {
    nextRoundRobinIndex: number;
}
/**
 * Rotate or prioritize the base chain according to the current policy.
 * Returns a new array — the original is never mutated.
 */
export declare function resolveSearchChain(baseChain: string[], policy: SearchRoutingPolicy, state?: SearchRoutingState, random?: () => number, metricsByProvider?: Record<string, ProviderMetrics>): string[];
