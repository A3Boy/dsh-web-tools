import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — "联网搜索" toggle button mounted in `conversation.input.left`.
 *
 * A small always-visible per-session control: click toggles the session's
 * Search Mode between `auto` and `required`. The mode lives in the HOST; this
 * is a thin read/write over `/web-tools/api/search-mode`.
 *
 * Interaction mirrors the DSH composer toolbar: `onMouseDown` keeps the
 * textarea caret, and clicks are optimistic (pending-guarded) so rapid toggles
 * can't race against a stale `required` state.
 * @module
 */
import { useEffect, useRef, useState } from "react";
import { IconGlobeOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "./api.js";
import { searchModeCss, adoptSearchModeStyles } from "./SearchModeButton.css.js";
export function SearchModeButton({ sessionId, label = "联网搜索", unavailableLabel = "没有可用的搜索源", }) {
    const [mode, setMode] = useState();
    const [available, setAvailable] = useState(true);
    const [pending, setPending] = useState(false);
    const generation = useRef(0);
    // Inject the one-time stylesheet so the class names in the JSX resolve.
    useEffect(() => {
        adoptSearchModeStyles();
    }, []);
    // Read the host state on mount / session change. `generation` guards against
    // a stale session's async response writing into the current session's UI.
    useEffect(() => {
        const current = ++generation.current;
        setMode(undefined);
        setPending(false);
        void api
            .searchModeGet(sessionId)
            .then((view) => {
            if (generation.current !== current)
                return;
            setMode(view.mode);
            setAvailable(view.available);
        })
            .catch(() => {
            // Unknown ≠ unavailable: keep the button usable rather than lie about
            // having no search source. (A stale host 404 must not gray it out.)
            if (generation.current === current)
                setMode("auto");
        });
    }, [sessionId]);
    const required = mode === "required";
    const toggle = async () => {
        if (mode === undefined || pending || !available)
            return;
        const current = generation.current;
        const previous = mode;
        const next = previous === "required" ? "auto" : "required";
        // Optimistic flip: no visible round-trip delay, no second click while pending.
        setMode(next);
        setPending(true);
        try {
            const view = await api.searchModeSet(sessionId, next);
            if (generation.current !== current)
                return;
            setMode(view.mode);
            setAvailable(view.available);
        }
        catch {
            if (generation.current !== current)
                return;
            setMode(previous); // rollback on failure
        }
        finally {
            if (generation.current === current)
                setPending(false);
        }
    };
    return (_jsxs("button", { type: "button", className: searchModeCss.trigger, "data-active": required || undefined, "aria-pressed": required, "aria-label": label, title: available ? label : unavailableLabel, disabled: !available || mode === undefined || pending, onMouseDown: (event) => {
            // Keep the textarea caret: toggling a mode must not steal compose focus.
            event.preventDefault();
        }, onClick: () => {
            void toggle();
        }, children: [_jsx("span", { className: searchModeCss.icon, "aria-hidden": true, children: _jsx(IconGlobeOutline14, { size: 14 }) }), _jsx("span", { className: searchModeCss.label, children: label })] }));
}
