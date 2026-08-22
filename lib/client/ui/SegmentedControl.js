import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — SegmentedControl: modern unified container with visible track and elevated selected tab.
 * @module
 */
import { text, surface } from "../theme.js";
export function SegmentedControl(props) {
    const { options, value, onChange, disabled, size = "md", style } = props;
    const isSm = size === "sm";
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: `
        .dswt-segmented-btn:focus-visible {
          outline: 2px solid var(--dsw-alias-brand-primary, #4f8cff);
          outline-offset: 1px;
          z-index: 1;
        }
      ` }), _jsx("div", { role: "radiogroup", style: {
                    display: "inline-flex",
                    alignItems: "center",
                    height: isSm ? 28 : 34,
                    padding: 2,
                    borderRadius: 8,
                    background: surface.layer2,
                    border: `1px solid ${surface.border}`,
                    boxSizing: "border-box",
                    maxWidth: "100%",
                    overflowX: "auto",
                    ...style,
                }, children: options.map((opt) => {
                    const selected = opt.value === value;
                    return (_jsx("button", { type: "button", role: "radio", "aria-checked": selected, disabled: disabled, title: opt.title, onClick: () => onChange(opt.value), className: "dswt-segmented-btn", style: {
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            padding: isSm ? "0 8px" : "0 12px",
                            borderRadius: 6,
                            border: "none",
                            background: selected ? surface.layer1 : "transparent",
                            color: selected ? "var(--dsw-alias-brand-primary, #2b66ff)" : text.secondary,
                            fontSize: 13,
                            fontWeight: selected ? 500 : 400,
                            fontFamily: "inherit",
                            cursor: disabled ? "not-allowed" : "pointer",
                            boxShadow: selected ? "0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)" : "none",
                            transition: "background .15s ease, color .15s ease, box-shadow .15s ease",
                            whiteSpace: "nowrap",
                            outline: "none",
                            flex: style?.width === "100%" ? 1 : "none",
                        }, children: opt.label }, opt.value));
                }) })] }));
}
