/**
 * dsh-web-tools — shared wire types between Host routes and the Client card.
 *
 * Single source of truth for the /web-tools/api contract, so Host return
 * shapes and Client consumption cannot drift apart.
 * @module
 */
/**
 * Search routing policy — how the host picks which provider to try first.
 *
 * Kept as a runtime array so the config schema, the HTTP validator and the
 * settings card all validate against ONE list: adding a policy cannot leave a
 * valid value rejected by whichever layer was forgotten (the exact defect that
 * made adaptive/fastest/cheapest unreachable from the UI and the API).
 */
export const SEARCH_ROUTING_POLICIES = [
    "ordered",
    "round-robin",
    "random",
    "adaptive",
    "fastest",
    "cheapest",
];
/** Whether a wire value is a known routing policy. */
export function isSearchRoutingPolicy(value) {
    return typeof value === "string" && SEARCH_ROUTING_POLICIES.includes(value);
}
/**
 * Retrieval orchestration strategy for one search request.
 *
 *  - single: try providers in the resolved order, one at a time (default).
 *  - hedged: start the first provider; if it is still running after
 *    `hedgeDelayMs`, start the second one in parallel. First success wins and
 *    the loser is CANCELLED so it stops consuming quota.
 *  - fused:  start two providers in parallel and merge both ranked lists with
 *    Reciprocal Rank Fusion. Wider recall at roughly double the cost.
 */
export const RETRIEVAL_STRATEGIES = ["single", "hedged", "fused"];
/** Whether a wire value is a known retrieval strategy. */
export function isRetrievalStrategy(value) {
    return typeof value === "string" && RETRIEVAL_STRATEGIES.includes(value);
}
/**
 * The click/keyboard cycle shared by the button and the `/search` command:
 * auto → required → off → auto. Keeping it in one place means the UI cannot
 * disagree with the slash command about what the next state is.
 */
export function nextSearchMode(mode) {
    if (mode === "auto")
        return "required";
    if (mode === "required")
        return "off";
    return "auto";
}
