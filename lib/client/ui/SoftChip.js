import { jsx as _jsx } from "react/jsx-runtime";
/**
 * dsh-web-tools — SoftChip: lightweight unbordered badge with brand-tinted background.
 * @module
 */
import { text } from "../theme.js";
export function SoftChip({ children }) {
    return (_jsx("span", { style: {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 20,
            padding: "0 6px",
            borderRadius: 6,
            background: "color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)",
            color: "var(--dsw-alias-brand-primary)",
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1,
            whiteSpace: "nowrap",
            flex: "none",
        }, children: children }));
}
