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
export const SECTION_ID = "web-tools";

/** Nav position: after Agent Presets (20), before Plugin Market (40). */
export const SECTION_ORDER = 30;

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
 * Page-language face handed to the section so it can render in English or
 * Chinese independently of the DSH-wide locale. `auto` preference (the
 * default) follows the DSH UI language via getActiveLocale/subscribeLocale.
 */
export interface UiFace {
  /** Current DSH-wide active locale id ("zh" | "en"). */
  getActiveLocale: () => string;
  /** Subscribe to DSH-wide locale switches; returns unsubscribe. */
  subscribeLocale: (fn: () => void) => () => void;
  /** zh page dictionary (key-set source of truth). */
  zhDict: Record<string, string>;
  /** en page dictionary, complete against zhDict. */
  enDict: Record<string, string>;
}

/**
 * Register the Web Search settings page.
 * @param ctx - client root context (slots service).
 * @param t - locale-bound translator for the page copy.
 * @param component - the section component (WebToolsSection).
 * @param ui - optional page-language face (independent language switch).
 */
export function registerSettingsSection(ctx: RegistrationCtx, t: SectionTFunc, component: unknown, ui?: UiFace): void {
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: SECTION_ID,
        order: SECTION_ORDER,
        label: () => t("nav"),
        inject: () => ({ t, ui }),
      },
      component,
    ),
  );
}
