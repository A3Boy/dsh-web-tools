import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * dsh-web-tools — SettingsGroup & SettingsRow: unified setting layout primitives.
 *
 * - SettingsRow renders a REAL `<button>` when clickable (never a div with a
 *   role), and hover/focus states live in CSS, not JS inline styles.
 * - SettingsGroup supports a `dividers` prop ("none" | "inset" | "full") so
 *   row separators are drawn at the GROUP level without per-row props.
 * @module
 */
import { text, surface } from "../theme.js";
import { IconChevronRightOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
export function SettingsGroup(props) {
    const { title, action, children, style, dividers = "none" } = props;
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: `
        .dswt-group-dividers-inset .dswt-settings-row + .dswt-settings-row::after,
        .dswt-group-dividers-full .dswt-settings-row + .dswt-settings-row::after {
          content: "";
          position: absolute;
          top: 0;
          height: 1px;
          background: ${surface.border};
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
      ` }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8, ...style }, children: [(title || action) && (_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }, children: [title && _jsx("span", { style: { fontSize: 13, fontWeight: 600, color: text.secondary, textTransform: "none" }, children: title }), action && _jsx("div", { children: action })] })), _jsx("div", { className: `dswt-group dswt-group-dividers-${dividers}`, style: {
                            display: "flex",
                            flexDirection: "column",
                            borderRadius: 12,
                            background: surface.layer1,
                            border: `1px solid ${surface.border}`,
                            overflow: "hidden",
                        }, children: children })] })] }));
}
export function SettingsRow(props) {
    const { icon, title, subtitle, trailing, chevron, onClick, disabled } = props;
    const isClickable = !!onClick && !disabled;
    const inner = (_jsxs(_Fragment, { children: [_jsx("style", { children: `
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
          transition: background .12s ease;
          opacity: ${disabled ? 0.6 : 1};
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
          background: ${surface.hover};
        }
        .dswt-settings-row.clickable:active {
          background: ${surface.hover};
        }
        .dswt-settings-row.clickable:focus-visible {
          outline: 2px solid var(--dsw-alias-brand-primary, #4f8cff);
          outline-offset: -2px;
        }
        .dswt-settings-row:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
      ` }), icon && _jsx("div", { style: { display: "inline-flex", alignItems: "center", flex: "none" }, children: icon }), _jsxs("div", { style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 500, color: text.primary, display: "flex", alignItems: "center", gap: 8 }, children: _jsx("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: title }) }), subtitle && (_jsx("div", { style: { fontSize: 12, color: text.tertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: subtitle }))] }), trailing && (_jsx("div", { style: { display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }, children: trailing })), chevron && (_jsx("div", { style: { display: "inline-flex", alignItems: "center", color: text.tertiary, flex: "none" }, children: _jsx(IconChevronRightOutline14, { size: 14 }) }))] }));
    if (isClickable) {
        return (_jsx("button", { type: "button", className: "dswt-settings-row clickable", onClick: onClick, disabled: disabled, children: inner }));
    }
    return (_jsx("div", { className: "dswt-settings-row", "aria-disabled": disabled === true, children: inner }));
}
