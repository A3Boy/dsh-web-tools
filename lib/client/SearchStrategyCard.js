import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — Search Mode card (搜索模式).
 *
 * Five user-facing modes: 推荐 / 快速 / 精准 / 节省 / 自定义. Picking a mode
 * applies a preset (per-provider options + preferred order) through the same
 * config/save gate; 自定义 hands control back to the manual order editor.
 *
 * No internal algorithms, no provider parameter names — just the outcome.
 * @module
 */
import { text, surface, accent } from "./theme.js";
export function SearchStrategyCard(props) {
    const { t, current, onApply, disabled } = props;
    const options = [
        { id: "recommended", icon: "⭐", title: t("strategyRecommended"), desc: t("strategyRecommendedDesc") },
        { id: "fast", icon: "⚡", title: t("strategyFast"), desc: t("strategyFastDesc") },
        { id: "quality", icon: "🎯", title: t("strategyQuality"), desc: t("strategyQualityDesc") },
        { id: "cheap", icon: "💰", title: t("strategyCheap"), desc: t("strategyCheapDesc") },
        { id: "custom", icon: "⚙", title: t("strategyCustom"), desc: t("strategyCustomDesc") },
    ];
    return (_jsx("div", { role: "radiogroup", "aria-label": t("strategyLabel"), style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }, children: options.map((o) => {
            const selected = o.id === current;
            return (_jsxs("button", { type: "button", role: "radio", "aria-checked": selected, disabled: disabled, onClick: () => { if (o.id !== current)
                    onApply(o.id); }, style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    alignItems: "flex-start",
                    padding: "9px 12px",
                    borderRadius: 10,
                    cursor: disabled ? "not-allowed" : "pointer",
                    border: `1px solid ${selected ? accent.primary : surface.border}`,
                    background: selected ? `color-mix(in srgb, ${accent.primary} 8%, transparent)` : surface.layer2,
                    fontFamily: "inherit",
                    fontSize: 13,
                    color: text.primary,
                    textAlign: "left",
                    outline: "none",
                    boxSizing: "border-box",
                }, children: [_jsxs("span", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { "aria-hidden": true, style: { fontSize: 14, lineHeight: 1 }, children: o.icon }), _jsx("span", { style: { fontWeight: 600, fontSize: 13 }, children: o.title })] }), _jsx("span", { style: { fontSize: 12, color: text.secondary, lineHeight: 1.4 }, children: o.desc })] }, o.id));
        }) }));
}
