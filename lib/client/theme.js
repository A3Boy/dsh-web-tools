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
export const text = {
    primary: "var(--dsw-alias-label-primary)",
    secondary: "var(--dsw-alias-label-secondary)",
    tertiary: "var(--dsw-alias-label-tertiary)",
};
/** Surfaces & borders. */
export const surface = {
    bg: "var(--dsw-alias-bg-base)",
    layer1: "var(--dsw-alias-bg-layer-1)",
    layer2: "var(--dsw-alias-bg-layer-2)",
    border: "var(--dsw-alias-border-l2)",
    borderStrong: "var(--dsw-alias-border-l3)",
    hover: "var(--dsw-alias-interactive-bg-hover)",
    active: "var(--dsw-alias-interactive-bg-active)",
    hoverDanger: "var(--dsw-alias-interactive-bg-hover-danger)",
};
/** Semantic state colors. */
export const state = {
    success: "var(--dsw-alias-state-success-primary)",
    warning: "var(--dsw-alias-state-warn-primary)",
    warnLabel: "var(--dsw-alias-state-warn-label)",
    danger: "var(--dsw-alias-state-error-primary)",
    business: "var(--dsw-alias-state-business-primary)",
};
/** Brand / accent. */
export const accent = {
    primary: "var(--dsw-alias-brand-primary)",
    text: "var(--dsw-alias-brand-text)",
};
/** Buttons. */
export const button = {
    primaryFill: "var(--dsw-alias-button-primary-fill)",
    primaryText: "var(--dsw-alias-label-primary-foreground)",
    primaryHover: "var(--dsw-alias-button-primary-hover)",
    ghostActive: "var(--dsw-alias-button-ghost-active-fill)",
};
/** Modal mask. */
export const mask = {
    backdrop: "var(--dsw-alias-bg-mask-2)",
};
/** Shadows (DSH levels). */
export const shadow = {
    lv3: "var(--dsw-shadow-lv3)",
};
/** Font family aliases (code / mono). */
export const font = {
    code: "var(--ds-font-family-code, ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New')",
};
