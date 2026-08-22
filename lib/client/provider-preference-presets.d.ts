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
export type ProviderPreferencePresetId = "fast" | "deep" | "economy";
export interface ProviderPreferencePreset {
    id: ProviderPreferencePresetId;
    patches: Record<string, Record<string, unknown>>;
}
/**
 * Keys each preset is allowed to touch. Any key NOT in this list survives
 * a preset switch (cache tolerances, token budgets, advanced knobs).
 */
export declare const PRESET_MANAGED_KEYS: Record<string, readonly string[]>;
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
export declare function buildPresetPatch(currentOverrides: Record<string, Record<string, unknown>>, preset: ProviderPreferencePreset): Record<string, Record<string, unknown> | null>;
export declare const PREFERENCE_PRESETS: Record<ProviderPreferencePresetId, ProviderPreferencePreset>;
