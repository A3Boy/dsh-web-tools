/**
 * dsh-web-tools — settings.section registration (pure, testable).
 *
 * Extracted from the client entry so the slot contract can be unit-tested
 * without a browser: given a minimal slots/locale surface it registers
 * EXACTLY ONE settings.section entry (id "web-tools") and never touches
 * settings.plugin.item.
 *
 * The section component is injected (not imported here) so this module stays
 * plain TypeScript — node can run it directly for tests.
 * @module
 */
/** Settings page nav id (drives the Settings section key). */
export declare const SECTION_ID = "web-tools";
/** Nav position: after Agent Presets (20), before Plugin Market (40). */
export declare const SECTION_ORDER = 30;
/** Minimal client ctx surface this registration needs. */
export interface RegistrationCtx {
    slots: {
        inject(name: string, fn: () => unknown): unknown;
        register(entry: Record<string, unknown>, component: unknown): unknown;
    };
}
/** t() bound to the dsh-web-tools namespace (injected into the section). */
export type SectionTFunc = (key: string, ...args: unknown[]) => string;
/**
 * Register the Web Search settings page.
 * @param ctx - client root context (slots service).
 * @param t - locale-bound translator for the page copy.
 * @param component - the section component (WebToolsSection).
 */
export declare function registerSettingsSection(ctx: RegistrationCtx, t: SectionTFunc, component: unknown): void;
