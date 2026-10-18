/**
 * dsh-web-tools — Search Mode selector styles.
 *
 * A single lightweight trigger plus a popover menu, the way composer tool
 * pickers usually look: one compact control, three named modes, no per-state
 * button chrome. DSH client plugins inject their own CSS at runtime (a
 * `<style>` tag with a stable id, HMR-safe) instead of emitting a separate
 * `.css` bundle — the web shell only loads the single `client.js`.
 * All colors are DSH semantic tokens; no raw hex.
 * @module
 */
/** Stable class map the component references. */
export declare const searchModeCss: {
    wrap: string;
    trigger: string;
    icon: string;
    chevron: string;
    label: string;
    menu: string;
    menuTitle: string;
    item: string;
    itemIcon: string;
    itemText: string;
    itemLabel: string;
    itemDescription: string;
    itemCheck: string;
};
/** Inject the stylesheet once (idempotent, HMR-safe). */
export declare function adoptSearchModeStyles(): void;
