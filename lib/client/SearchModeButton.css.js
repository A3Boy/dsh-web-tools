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
const STYLE_ID = "dsh-web-tools-search-mode";
const CSS = `
.wt-search-mode-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 0 0 auto;
  height: 28px;
  padding: 0 8px;
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
  transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease;
}
.wt-search-mode-trigger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.wt-search-mode-trigger[data-active="true"] {
  border-color: var(--dsw-alias-state-business-primary);
  background: transparent;
  color: var(--dsw-alias-state-business-primary);
}
.wt-search-mode-trigger[data-active="true"]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.wt-search-mode-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);
}
/* visual states: only "no provider" reads as truly unavailable/dimmed. */
.wt-search-mode-trigger[data-unavailable="true"] {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
  opacity: 0.55;
}
.wt-search-mode-trigger:disabled {
  cursor: default;
}
/* loading/pending keep their normal colors (never grey out while reading). */
.wt-search-mode-trigger[data-loading="true"],
.wt-search-mode-trigger[data-pending="true"] {
  opacity: 1;
}
.wt-search-mode-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.wt-search-mode-label {
  white-space: nowrap;
}
/* Mobile: mirror the DSH composer (its row is an anonymous size container).
   Below 460px hide the label and keep a 28px globe-only affordance. */
@container (max-width: 460px) {
  .wt-search-mode-trigger {
    width: 28px;
    padding: 0;
    justify-content: center;
    border-radius: 999px;
  }
  .wt-search-mode-label {
    display: none;
  }
}
`;
/** Stable class map the component references. */
export const searchModeCss = {
    trigger: "wt-search-mode-trigger",
    icon: "wt-search-mode-icon",
    label: "wt-search-mode-label",
};
/** Inject the stylesheet once (idempotent, HMR-safe). */
export function adoptSearchModeStyles() {
    if (typeof document === "undefined")
        return;
    if (document.getElementById(STYLE_ID) !== null)
        return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}
