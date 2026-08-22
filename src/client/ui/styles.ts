/**
 * dsh-web-tools — unified V6 styles and CSS adoption.
 *
 * All styles inherit DSH `--dsw-alias-*` theme tokens. This module injects a
 * single, stable `<style>` tag into document.head so the client plugin
 * maintains exact V6 pixel specs without polluting JSX with inline styles.
 * @module
 */

const STYLE_ID = "dsh-web-tools-v6-styles";

const CSS = `
/* ==========================================================================
   dsh-web-tools V6 Unified Stylesheet
   ========================================================================== */

/* Modal Geometry & Layout */
.dswt-modal-dialog {
  width: 710px !important;
  max-height: min(780px, calc(100vh - 40px)) !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 30px 36px 34px !important;
  box-sizing: border-box !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
}
@media (max-width: 760px) {
  .dswt-modal-dialog {
    width: calc(100vw - 24px) !important;
    padding: 24px 20px !important;
  }
}

/* Modal Body Spacing */
.dswt-modal-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Provider Header */
.dswt-provider-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 2px;
}
.dswt-provider-identity {
  display: flex;
  align-items: center;
  gap: 14px;
}
.dswt-provider-logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  flex-shrink: 0;
  object-fit: contain;
}
.dswt-provider-title-stack {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.dswt-provider-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 26px;
  color: var(--dsw-alias-label-primary);
}
.dswt-provider-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dswt-provider-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 4px;
}
.dswt-modal-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
  transition: color .15s ease, background-color .15s ease;
  outline: none;
}
.dswt-modal-close-btn:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

/* SettingsGroup */
.dswt-group-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dswt-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}
.dswt-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
  text-transform: none;
  letter-spacing: normal;
}
.dswt-group-card {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  overflow: hidden;
  box-sizing: border-box;
}
.dswt-search-card-inner {
  padding: 18px 20px 20px;
}

/* Group Dividers */
.dswt-group-dividers-inset .dswt-settings-row + .dswt-settings-row::after,
.dswt-group-dividers-full .dswt-settings-row + .dswt-settings-row::after {
  content: "";
  position: absolute;
  top: 0;
  height: 1px;
  background: var(--dsw-alias-border-l2);
  pointer-events: none;
}
.dswt-group-dividers-inset .dswt-settings-row + .dswt-settings-row::after {
  left: 48px;
  right: 0;
}
.dswt-group-dividers-full .dswt-settings-row + .dswt-settings-row::after {
  left: 0;
  right: 0;
}

/* SettingsRow */
.dswt-settings-row {
  width: 100%;
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  min-height: 54px;
  background: transparent;
  cursor: default;
  outline: none;
  transition: background-color .12s ease;
  border: none;
  margin: 0;
  text-align: left;
  font-family: inherit;
  color: inherit;
}
.dswt-settings-row.clickable {
  cursor: pointer;
}
.dswt-settings-row.clickable:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dswt-settings-row.clickable:active {
  background: var(--dsw-alias-interactive-bg-active);
}
.dswt-settings-row.clickable:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4f8cff);
  outline-offset: -2px;
}
.dswt-settings-row:disabled,
.dswt-settings-row[aria-disabled="true"] {
  opacity: 0.6;
}
.dswt-settings-row:disabled {
  cursor: not-allowed;
}
.dswt-row-icon {
  display: inline-flex;
  align-items: center;
  flex: none;
  color: var(--dsw-alias-label-secondary);
}
.dswt-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dswt-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.dswt-row-subtitle {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dswt-row-trailing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.dswt-row-chevron {
  display: inline-flex;
  align-items: center;
  color: var(--dsw-alias-label-tertiary);
  flex: none;
}

/* SegmentedControl */
.dswt-segmented-track {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 2px;
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2, #f3f4f6);
  border: 1px solid var(--dsw-alias-border-l3);
  box-sizing: border-box;
  max-width: 100%;
  overflow-x: auto;
}
.dswt-segmented-track-sm {
  height: 30px;
  border-radius: 8px;
}
.dswt-segmented-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 12px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 400;
  font-family: inherit;
  cursor: pointer;
  box-shadow: none;
  transition: background-color .15s ease, color .15s ease, box-shadow .15s ease;
  white-space: nowrap;
  outline: none;
}
.dswt-segmented-btn-sm {
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
}
.dswt-segmented-btn.selected {
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-brand-primary, #2b66ff);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
}
.dswt-segmented-btn:hover:not(.selected):not(:disabled) {
  color: var(--dsw-alias-label-primary);
}
.dswt-segmented-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4f8cff);
  outline-offset: 1px;
  z-index: 1;
}
.dswt-segmented-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* Preferences & Advanced Sub-surface */
.dswt-pref-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dswt-pref-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.dswt-pref-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  min-height: 18px;
}
.dswt-advanced-disclosure {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 0;
}
.dswt-advanced-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: color .15s ease;
}
.dswt-advanced-btn:hover {
  color: var(--dsw-alias-label-primary);
}
.dswt-advanced-surface {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  box-sizing: border-box;
}

/* Input / Dropdown / Key items in Modal */
.dswt-input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dswt-input-num {
  height: 32px;
  width: 72px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  text-align: center;
  box-sizing: border-box;
  outline: none;
}
.dswt-dropdown-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
`;

/** Inject the stylesheet once (idempotent, HMR-safe). */
export function adoptWebToolsStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
