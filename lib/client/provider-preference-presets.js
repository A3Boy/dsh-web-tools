/**
 * dsh-web-tools — Batch preference presets (one-shot, not persistent modes).
 *
 * Each preset adjusts per-provider native options. A preset NEVER changes
 * the search order, NEVER merges over existing overrides, and NEVER leaves
 * stale keys from a previous preset.
 *
 * Application is safe: for each provider the preset controls, ALL keys in
 * PRESET_MANAGED_KEYS are first cleared, then the target values are written.
 * Keys outside PRESET_MANAGED_KEYS (cache, token budget, …) are preserved.
 * @module
 */
/**
 * Keys each preset is allowed to touch. Any key NOT in this list survives
 * a preset switch (cache tolerances, token budgets, advanced knobs).
 */
export const PRESET_MANAGED_KEYS = {
    exa: ["searchType"],
    tavily: ["searchDepth", "autoParameters"],
    brave: ["endpointPreference"],
    you: ["extractionMode"],
    firecrawl: ["fetchOnlyMainContent"],
    parallel: ["mode"],
    jina: ["fetchEngine", "fetchReaderLmV2"],
};
/**
 * Build a safe patch for provider-options/batch.
 *
 * For each provider the preset touches:
 *  1. Start from the current overrides (if any).
 *  2. Delete every key in PRESET_MANAGED_KEYS for that provider.
 *  3. Write the preset's target values.
 *  4. If the result is empty → null (clear override); else use as-is.
 *
 * Providers NOT in the preset are left untouched.
 */
export function buildPresetPatch(currentOverrides, preset) {
    const out = {};
    for (const [provider, targetValues] of Object.entries(preset.patches)) {
        const managedKeys = PRESET_MANAGED_KEYS[provider] ?? [];
        const next = { ...(currentOverrides[provider] ?? {}) };
        for (const key of managedKeys) {
            delete next[key];
        }
        Object.assign(next, targetValues);
        out[provider] = Object.keys(next).length > 0 ? next : null;
    }
    return out;
}
export const PREFERENCE_PRESETS = {
    fast: {
        id: "fast",
        patches: {
            exa: { searchType: "fast" },
            tavily: { searchDepth: "fast" },
            brave: { endpointPreference: "auto" },
            parallel: { mode: "turbo" },
        },
    },
    deep: {
        id: "deep",
        patches: {
            exa: { searchType: "deep-lite" },
            tavily: { searchDepth: "advanced" },
            you: { extractionMode: "highlights" },
            parallel: { mode: "advanced" },
            jina: { fetchReaderLmV2: true },
        },
    },
    economy: {
        id: "economy",
        patches: {
            exa: { searchType: "auto" },
            brave: { endpointPreference: "auto" },
            parallel: { mode: "basic" },
        },
    },
};
