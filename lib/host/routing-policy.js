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
/** Cost tier rating from 0 (free/self-hosted) to 3 (premium multi-step / scrape). */
export const PROVIDER_COST_TIERS = {
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
/**
 * Rotate or prioritize the base chain according to the current policy.
 * Returns a new array — the original is never mutated.
 */
export function resolveSearchChain(baseChain, policy, state, random = Math.random, metricsByProvider) {
    if (baseChain.length <= 1)
        return [...baseChain];
    if (policy === "ordered")
        return [...baseChain];
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
            const calcScore = (name) => {
                const m = metricsByProvider[name];
                if (!m || (m.success === 0 && m.failed === 0))
                    return 0.75; // neutral prior
                const total = m.success + m.failed;
                const successRate = m.success / total;
                const latency = m.avgLatencyMs > 0 ? m.avgLatencyMs : 500;
                const latencyScore = 1 / Math.log10(10 + latency);
                return successRate * 0.7 + latencyScore * 0.3;
            };
            return calcScore(b) - calcScore(a);
        });
    }
    // Metric-driven policies WITHOUT measurements must preserve the operator's
    // order. Falling through to the rotation branch below would silently turn a
    // deterministic policy into a random one, which is undebuggable in production.
    if (policy === "adaptive" || policy === "fastest") {
        return [...baseChain];
    }
    let offset = 0;
    if (policy === "round-robin") {
        const st = state ?? { nextRoundRobinIndex: 0 };
        offset = st.nextRoundRobinIndex % baseChain.length;
        st.nextRoundRobinIndex = (st.nextRoundRobinIndex + 1) % baseChain.length;
    }
    else {
        offset = Math.floor(random() * baseChain.length);
    }
    return [...baseChain.slice(offset), ...baseChain.slice(0, offset)];
}
