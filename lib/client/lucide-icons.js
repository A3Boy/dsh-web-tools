import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** The one SVG frame every icon below reuses. */
function LucideSvg(props) {
    const size = props.size ?? 16;
    const strokeWidth = props.strokeWidth ?? 1.8;
    return (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: strokeWidth, strokeLinecap: "round", strokeLinejoin: "round", className: props.className, style: props.style, "aria-hidden": "true", focusable: "false", children: props.children }));
}
/** `globe` — a mode that may reach the web. */
export function GlobeIcon(props) {
    return (_jsxs(LucideSvg, { ...props, children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" }), _jsx("path", { d: "M2 12h20" })] }));
}
/** `wifi-off` — web access switched off. */
export function WifiOffIcon(props) {
    return (_jsxs(LucideSvg, { ...props, children: [_jsx("path", { d: "M12 20h.01" }), _jsx("path", { d: "M8.5 16.429a5 5 0 0 1 7 0" }), _jsx("path", { d: "M5 12.859a10 10 0 0 1 5.17-2.69" }), _jsx("path", { d: "M19 12.859a10 10 0 0 0-2.007-1.523" }), _jsx("path", { d: "M2 8.82a15 15 0 0 1 4.177-2.643" }), _jsx("path", { d: "M22 8.82a15 15 0 0 0-11.288-3.764" }), _jsx("path", { d: "m2 2 20 20" })] }));
}
/** `radio-tower` — the mode that stays switched on every turn. */
export function RadioTowerIcon(props) {
    return (_jsxs(LucideSvg, { ...props, children: [_jsx("path", { d: "M4.9 16.1C1 12.2 1 5.8 4.9 1.9" }), _jsx("path", { d: "M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" }), _jsx("circle", { cx: "12", cy: "9", r: "2" }), _jsx("path", { d: "M16.2 4.8c2 2 2.26 5.11.8 7.47" }), _jsx("path", { d: "M19.1 1.9a9.96 9.96 0 0 1 0 14.1" }), _jsx("path", { d: "M9.5 18h5" }), _jsx("path", { d: "m8 22 4-11 4 11" })] }));
}
/** `chevron-down` — "there is a menu here". */
export function ChevronDownIcon(props) {
    return (_jsx(LucideSvg, { ...props, children: _jsx("path", { d: "m6 9 6 6 6-6" }) }));
}
/** `check` — the active menu row. */
export function CheckIcon(props) {
    return (_jsx(LucideSvg, { ...props, children: _jsx("path", { d: "M20 6 9 17l-5-5" }) }));
}
