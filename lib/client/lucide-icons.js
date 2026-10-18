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
/** `refresh-cw` — the mode that repeats the lookup every turn. */
export function RefreshCwIcon(props) {
    return (_jsxs(LucideSvg, { ...props, children: [_jsx("path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }), _jsx("path", { d: "M21 3v5h-5" }), _jsx("path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }), _jsx("path", { d: "M8 16H3v5" })] }));
}
/** `chevron-down` — "there is a menu here". */
export function ChevronDownIcon(props) {
    return (_jsx(LucideSvg, { ...props, children: _jsx("path", { d: "m6 9 6 6 6-6" }) }));
}
/** `check` — the active menu row. */
export function CheckIcon(props) {
    return (_jsx(LucideSvg, { ...props, children: _jsx("path", { d: "M20 6 9 17l-5-5" }) }));
}
