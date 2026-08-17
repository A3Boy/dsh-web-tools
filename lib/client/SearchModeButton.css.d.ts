/**
 * dsh-web-tools — Search Mode button styles.
 *
 * DSH client plugins inject their own CSS at runtime (a `<style>` tag with a
 * stable id, HMR-safe) instead of emitting a separate `.css` bundle — the web
 * shell only loads the single `client.js`. This mirrors the proven pattern of
 * `dsh-at-file` (`adoptStyles`). All colors are DSH semantic tokens; no raw
 * hex anywhere, no solid brand fill — a blue thin outline when active.
 * @module
 */
/** Stable class map the component references. */
export declare const searchModeCss: {
    trigger: string;
    icon: string;
    label: string;
};
/** Inject the stylesheet once (idempotent, HMR-safe). */
export declare function adoptSearchModeStyles(): void;
