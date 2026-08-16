/**
 * dsh-web-tools — semantic theme tokens.
 *
 * Every color below maps to a DSH `--dsw-alias-*` variable so the page
 * inherits the host theme (light/dark) instead of deciding its own palette.
 * Components reference these constants — never raw hex — so the page cannot
 * drift from the DSH design language.
 * @module
 */
/** Text hierarchy. */
export declare const text: {
    readonly primary: "var(--dsw-alias-label-primary)";
    readonly secondary: "var(--dsw-alias-label-secondary)";
    readonly tertiary: "var(--dsw-alias-label-tertiary)";
};
/** Surfaces & borders. */
export declare const surface: {
    readonly bg: "var(--dsw-alias-bg-base)";
    readonly layer1: "var(--dsw-alias-bg-layer-1)";
    readonly layer2: "var(--dsw-alias-bg-layer-2)";
    readonly border: "var(--dsw-alias-border-l2)";
    readonly borderStrong: "var(--dsw-alias-border-l3)";
    readonly hover: "var(--dsw-alias-interactive-bg-hover)";
    readonly active: "var(--dsw-alias-interactive-bg-active)";
    readonly hoverDanger: "var(--dsw-alias-interactive-bg-hover-danger)";
};
/** Semantic state colors. */
export declare const state: {
    readonly success: "var(--dsw-alias-state-success-primary)";
    readonly warning: "var(--dsw-alias-state-warn-primary)";
    readonly warnLabel: "var(--dsw-alias-state-warn-label)";
    readonly danger: "var(--dsw-alias-state-error-primary)";
    readonly business: "var(--dsw-alias-state-business-primary)";
};
/** Brand / accent. */
export declare const accent: {
    readonly primary: "var(--dsw-alias-brand-primary)";
    readonly text: "var(--dsw-alias-brand-text)";
};
/** Buttons. */
export declare const button: {
    readonly primaryFill: "var(--dsw-alias-button-primary-fill)";
    readonly primaryText: "var(--dsw-alias-label-primary-foreground)";
    readonly primaryHover: "var(--dsw-alias-button-primary-hover)";
    readonly ghostActive: "var(--dsw-alias-button-ghost-active-fill)";
};
/** Modal mask. */
export declare const mask: {
    readonly backdrop: "var(--dsw-alias-bg-mask-2)";
};
/** Shadows (DSH levels). */
export declare const shadow: {
    readonly lv3: "var(--dsw-shadow-lv3)";
};
/** Font family aliases (code / mono). */
export declare const font: {
    readonly code: "var(--ds-font-family-code, ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New')";
};
