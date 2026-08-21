import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — SettingsGroup & SettingsRow: unified setting layout primitives.
 * @module
 */
import { text, surface } from "../theme.js";
import { IconChevronRightOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
export function SettingsGroup(props) {
    const { title, action, children, style } = props;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, ...style }, children: [(title || action) && (_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }, children: [title && _jsx("span", { style: { fontSize: 12, fontWeight: 600, color: text.tertiary, textTransform: "none" }, children: title }), action && _jsx("div", { children: action })] })), _jsx("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: 12,
                    background: surface.layer1,
                    border: `1px solid ${surface.border}`,
                    overflow: "hidden",
                }, children: children })] }));
}
export function SettingsRow(props) {
    const { icon, title, subtitle, trailing, chevron, onClick, isLast, insetDivider, disabled } = props;
    const isClickable = !!onClick && !disabled;
    return (_jsxs("div", { role: isClickable ? "button" : undefined, tabIndex: isClickable ? 0 : undefined, onClick: isClickable ? onClick : undefined, onKeyDown: isClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                }
            }
            : undefined, style: {
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            minHeight: 48,
            background: "transparent",
            cursor: isClickable ? "pointer" : "default",
            outline: "none",
            transition: "background .12s ease",
            opacity: disabled ? 0.6 : 1,
            boxSizing: "border-box",
        }, onMouseEnter: isClickable ? (e) => { e.currentTarget.style.background = surface.hover; } : undefined, onMouseLeave: isClickable ? (e) => { e.currentTarget.style.background = "transparent"; } : undefined, children: [icon && _jsx("div", { style: { display: "inline-flex", alignItems: "center", flex: "none" }, children: icon }), _jsxs("div", { style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 500, color: text.primary, display: "flex", alignItems: "center", gap: 8 }, children: _jsx("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: title }) }), subtitle && (_jsx("div", { style: { fontSize: 12, color: text.tertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: subtitle }))] }), trailing && (_jsx("div", { style: { display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }, children: trailing })), chevron && (_jsx("div", { style: { display: "inline-flex", alignItems: "center", color: text.tertiary, flex: "none" }, children: _jsx(IconChevronRightOutline14, { size: 14 }) })), !isLast && (_jsx("div", { style: {
                    position: "absolute",
                    bottom: 0,
                    left: insetDivider ? 48 : 0,
                    right: 0,
                    height: 1,
                    background: surface.border,
                    pointerEvents: "none",
                } }))] }));
}
