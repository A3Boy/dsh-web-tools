import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — ChoiceCard: single-select radio card.
 *
 * Replaces native <select> for primary provider mode selection.
 * role=radio / radiogroup, DSH theme tokens, no large icons/gradients.
 * @module
 */
import { Pill } from "@deepseek-ai/dsh-client-ui-primitives";
import { text, surface, state as stateColor, accent } from "../theme.js";
export function ChoiceCard(props) {
    const { selected, title, description, badge, meta, warning, disabled, onClick } = props;
    return (_jsxs("div", { role: "radio", "aria-checked": selected, "aria-disabled": disabled, onClick: disabled ? undefined : onClick, onKeyDown: (e) => {
            if (disabled)
                return;
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
            }
        }, tabIndex: disabled ? -1 : 0, style: {
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minHeight: 66,
            padding: "10px 12px",
            borderRadius: 10,
            cursor: disabled ? "not-allowed" : "pointer",
            border: `1px solid ${selected ? accent.primary : surface.border}`,
            background: selected ? `color-mix(in srgb, ${accent.primary} 6%, transparent)` : surface.layer2,
            opacity: disabled ? 0.5 : 1,
            fontFamily: "inherit",
            fontSize: 14,
            color: text.primary,
            textAlign: "left",
            boxSizing: "border-box",
            transition: "border-color .12s ease, background .12s ease",
            outline: "none",
        }, onMouseEnter: (e) => {
            if (!disabled && !selected)
                e.currentTarget.style.background = surface.hover;
        }, onMouseLeave: (e) => {
            if (!disabled && !selected)
                e.currentTarget.style.background = surface.layer2;
        }, onFocus: (e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${accent.primary}40`; }, onBlur: (e) => { e.currentTarget.style.boxShadow = "none"; }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [_jsx("span", { style: { fontWeight: 600, fontSize: 13, color: text.primary }, children: title }), badge && (_jsx(Pill, { active: badge === "推荐", children: badge })), meta && _jsx("span", { style: { marginLeft: "auto", fontSize: 11, color: text.tertiary, whiteSpace: "nowrap" }, children: meta })] }), description && (_jsx("span", { style: { fontSize: 12, color: text.secondary, lineHeight: 1.4 }, children: description })), warning && selected && (_jsx("span", { style: { fontSize: 11, color: stateColor.warning }, children: warning }))] }));
}
