import { jsx as _jsx } from "react/jsx-runtime";
/**
 * dsh-web-tools — SegmentedControl: modern unified container with elevated selected tab.
 * @module
 */
import { text, surface } from "../theme.js";
export function SegmentedControl(props) {
    const { options, value, onChange, disabled, size = "md" } = props;
    const isSm = size === "sm";
    return (_jsx("div", { role: "radiogroup", style: {
            display: "inline-flex",
            alignItems: "center",
            padding: 3,
            borderRadius: 9,
            background: surface.layer2,
            boxSizing: "border-box",
            maxWidth: "100%",
            overflowX: "auto",
        }, children: options.map((opt) => {
            const selected = opt.value === value;
            return (_jsx("button", { type: "button", role: "radio", "aria-checked": selected, disabled: disabled, title: opt.title, onClick: () => onChange(opt.value), style: {
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: isSm ? 26 : 30,
                    padding: isSm ? "0 9px" : "0 12px",
                    borderRadius: 7,
                    border: "none",
                    background: selected ? surface.layer1 : "transparent",
                    color: selected ? text.primary : text.secondary,
                    fontSize: 12,
                    fontWeight: selected ? 600 : 400,
                    fontFamily: "inherit",
                    cursor: disabled ? "not-allowed" : "pointer",
                    boxShadow: selected ? "0 1px 3px rgba(0,0,0,0.08), 0 1px 1px rgba(0,0,0,0.04)" : "none",
                    transition: "all .12s cubic-bezier(0.4, 0, 0.2, 1)",
                    whiteSpace: "nowrap",
                    outline: "none",
                    flex: "none",
                }, children: opt.label }, opt.value));
        }) }));
}
