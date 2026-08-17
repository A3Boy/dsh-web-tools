import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — "联网搜索" toggle button mounted in `conversation.input.left`.
 *
 * Renders a small always-visible per-session control: click toggles the
 * session's Search Mode between `auto` and `required`. The actual mode lives
 * in the HOST (survives refresh/session switch) — this component is a thin
 * read/write over `/web-tools/api/search-mode`.
 *
 * Agent-client React: no JSX beyond HMR/tsc compile, plain function component.
 * @module
 */
import { useEffect, useState } from "react";
import { api } from "./api.js";
import { accent, surface, text } from "./theme.js";
/** The literal globe ("t") is not in the primitives set; use a small unicode. */
const GLOBE = "🌐";
export function SearchModeButton(props) {
    const { sessionId } = props;
    const [mode, setMode] = useState(undefined);
    const [available, setAvailable] = useState(true);
    // Read the host state on mount / session change (the button never guesses).
    useEffect(() => {
        let active = true;
        setMode(undefined);
        api
            .searchModeGet(sessionId)
            .then((v) => {
            if (!active)
                return;
            setMode(v.mode);
            setAvailable(v.available);
        })
            .catch(() => {
            if (active)
                setAvailable(false);
        });
        return () => {
            active = false;
        };
    }, [sessionId]);
    const required = mode === "required";
    const click = () => {
        const next = required ? "auto" : "required";
        api.searchModeSet(sessionId, next).then((v) => {
            setMode(v.mode);
            setAvailable(v.available);
        }).catch(() => {
            /* keep current on failure — UI never desyncs from Host */
        });
    };
    return (_jsxs("button", { type: "button", onClick: click, disabled: !available, title: available ? "联网搜索" : "没有可用的搜索源", "aria-pressed": required, style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            borderRadius: 8,
            border: required ? `1px solid ${accent.primary}` : `1px solid ${surface.border}`,
            background: required ? accent.primary : "transparent",
            color: required ? accent.text : text.secondary,
            cursor: available ? "pointer" : "not-allowed",
            opacity: available ? 1 : 0.45,
            padding: "3px 8px",
            fontSize: 12,
            lineHeight: 1,
            whiteSpace: "nowrap",
            transition: "background .15s ease, color .15s ease, border-color .15s ease",
        }, children: [_jsx("span", { "aria-hidden": true, children: GLOBE }), _jsx("span", { children: required ? "联网搜索" : "联网搜索" })] }));
}
