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
import { adoptWebToolsStyles } from "./styles.js";
import { IconChevronRightOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
export function SettingsGroup(props) {
    adoptWebToolsStyles();
    const { title, action, children, style, dividers = "none" } = props;
    return (_jsxs("div", { className: "dswt-group-wrapper", style: style, children: [(title || action) && (_jsxs("div", { className: "dswt-group-header", children: [title && _jsx("span", { className: "dswt-group-title", children: title }), action && _jsx("div", { children: action })] })), _jsx("div", { className: `dswt-group-card dswt-group-dividers-${dividers}`, children: children })] }));
}
export function SettingsRow(props) {
    adoptWebToolsStyles();
    const { icon, title, subtitle, trailing, chevron, onClick, disabled } = props;
    const isClickable = !!onClick && !disabled;
    const inner = (_jsxs(_Fragment, { children: [icon && _jsx("div", { className: "dswt-row-icon", children: icon }), _jsxs("div", { className: "dswt-row-main", children: [_jsx("div", { className: "dswt-row-title", children: typeof title === "string" ? (_jsx("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: title })) : (title) }), subtitle && (_jsx("div", { className: "dswt-row-subtitle", children: subtitle }))] }), trailing && (_jsx("div", { className: "dswt-row-trailing", children: trailing })), chevron && (_jsx("div", { className: "dswt-row-chevron", children: _jsx(IconChevronRightOutline14, { size: 14 }) }))] }));
    if (isClickable) {
        return (_jsx("button", { type: "button", className: "dswt-settings-row clickable", onClick: onClick, disabled: disabled, children: inner }));
    }
    return (_jsx("div", { className: "dswt-settings-row", "aria-disabled": disabled === true, children: inner }));
}
