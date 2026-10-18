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
const STYLE_ID = "dsh-web-tools-search-mode";
const CSS = `
.wt-sm-wrap {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

/* ---- trigger ---------------------------------------------------------- */
.wt-sm-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  min-width: 0;
  padding: 0 8px 0 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsw-font-family);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 100ms ease, color 100ms ease, border-color 100ms ease;
}
.wt-sm-trigger:hover:not(:disabled),
.wt-sm-trigger[data-open="true"] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.wt-sm-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);
}
/* "always search" is the one non-default mode that behaves differently for
   every turn, so it gets the light blue treatment instead of plain text. */
.wt-sm-trigger[data-mode="required"] {
  background: transparent;
  color: var(--dsw-alias-state-business-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
}
.wt-sm-trigger[data-mode="required"]:hover:not(:disabled),
.wt-sm-trigger[data-mode="required"][data-open="true"] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent);
}
/* "off" is a mode, not a disabled control: normal grey text, no dimming. */
.wt-sm-trigger[data-mode="off"] {
  color: var(--dsw-alias-label-secondary);
}
.wt-sm-trigger[data-unavailable="true"] {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
  opacity: 0.55;
}
.wt-sm-trigger:disabled {
  cursor: default;
}
.wt-sm-trigger[data-loading="true"],
.wt-sm-trigger[data-pending="true"] {
  opacity: 1;
}
.wt-sm-icon,
.wt-sm-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.wt-sm-chevron {
  color: var(--dsw-alias-label-tertiary);
  transition: transform 120ms ease;
}
.wt-sm-trigger[data-open="true"] .wt-sm-chevron {
  transform: rotate(180deg);
}
.wt-sm-label {
  white-space: nowrap;
}

/* ---- menu ------------------------------------------------------------- */
.wt-sm-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  z-index: 60;
  min-width: 296px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-layer-2));
  box-shadow: 0 10px 30px rgb(0 0 0 / 12%);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wt-sm-menu-title {
  padding: 6px 8px 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
  font-weight: 500;
}
.wt-sm-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  align-items: start;
  gap: 10px;
  width: 100%;
  padding: 8px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  text-align: left;
  cursor: pointer;
}
.wt-sm-item:hover,
.wt-sm-item:focus-visible {
  outline: none;
  background: var(--dsw-alias-interactive-bg-hover);
}
.wt-sm-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.wt-sm-item[data-mode="required"] .wt-sm-item-icon {
  color: var(--dsw-alias-state-business-primary);
}
.wt-sm-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.wt-sm-item-label {
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.wt-sm-item-description {
  font-size: 12px;
  line-height: 17px;
  color: var(--dsw-alias-label-tertiary);
}
.wt-sm-item-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  color: var(--dsw-alias-label-primary);
}

/* Mobile: the composer row is an anonymous size container. Below 460px keep a
   30px icon-only affordance and drop the menu width constraint. */
@container (max-width: 460px) {
  .wt-sm-trigger {
    width: 30px;
    padding: 0;
    justify-content: center;
    border-radius: 999px;
  }
  .wt-sm-label,
  .wt-sm-chevron {
    display: none;
  }
  .wt-sm-menu {
    min-width: 260px;
  }
}
`;
/** Stable class map the component references. */
export const searchModeCss = {
    wrap: "wt-sm-wrap",
    trigger: "wt-sm-trigger",
    icon: "wt-sm-icon",
    chevron: "wt-sm-chevron",
    label: "wt-sm-label",
    menu: "wt-sm-menu",
    menuTitle: "wt-sm-menu-title",
    item: "wt-sm-item",
    itemIcon: "wt-sm-item-icon",
    itemText: "wt-sm-item-text",
    itemLabel: "wt-sm-item-label",
    itemDescription: "wt-sm-item-description",
    itemCheck: "wt-sm-item-check",
};
/** Inject the stylesheet once (idempotent, HMR-safe). */
export function adoptSearchModeStyles() {
    if (typeof document === "undefined")
        return;
    const existing = document.getElementById(STYLE_ID);
    if (existing !== null) {
        // HMR: replace stale rules from an older build of this file.
        existing.textContent = CSS;
        return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}
