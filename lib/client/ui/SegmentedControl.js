import { jsx as _jsx } from "react/jsx-runtime";
/**
 * dsh-web-tools — SegmentedControl: modern unified container with visible track and elevated selected tab.
 * @module
 */
import { adoptWebToolsStyles } from "./styles.js";
export function SegmentedControl(props) {
    adoptWebToolsStyles();
    const { options, value, onChange, disabled, size = "md", style } = props;
    const isSm = size === "sm";
    return (_jsx("div", { role: "radiogroup", className: `dswt-segmented-track ${isSm ? "dswt-segmented-track-sm" : ""}`, style: style, children: options.map((opt) => {
            const selected = opt.value === value;
            return (_jsx("button", { type: "button", role: "radio", "aria-checked": selected, disabled: disabled, title: opt.title, onClick: () => onChange(opt.value), className: `dswt-segmented-btn ${isSm ? "dswt-segmented-btn-sm" : ""} ${selected ? "selected" : ""}`, style: {
                    flex: style?.width === "100%" ? 1 : "none",
                }, children: opt.label }, opt.value));
        }) }));
}
