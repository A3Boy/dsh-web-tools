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
/**
 * Rotate the base chain according to the current policy.
 * Returns a new array — the original is never mutated.
 */
export function resolveSearchChain(baseChain, policy, state, random = Math.random) {
    if (baseChain.length <= 1)
        return [...baseChain];
    if (policy === "ordered")
        return [...baseChain];
    let offset = 0;
    if (policy === "round-robin") {
        offset = state.nextRoundRobinIndex % baseChain.length;
        state.nextRoundRobinIndex = (state.nextRoundRobinIndex + 1) % baseChain.length;
    }
    else {
        offset = Math.floor(random() * baseChain.length);
    }
    return [...baseChain.slice(offset), ...baseChain.slice(0, offset)];
}
