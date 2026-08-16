import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — search-order editor dialog (Modal).
 *
 * Edits ONE ordered list = [defaultProvider, ...fallbackOrder]; persists back
 * with the Host schema untouched (defaultProvider = list[0], fallbackOrder =
 * rest). Per-row actions: make default / move up / move down / remove.
 * Add appends an enabled provider not yet in the chain.
 * @module
 */
import { useRef, useState } from "react";
import { Button, IconChevronDownOutline14, IconChevronUpOutline14, IconPlusOutline16, Modal, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import { text, surface, state as stateColor } from "./theme.js";
export function RoutingModal(props) {
    const { t, providers, ordered, onClose, onSave } = props;
    // Local draft; committed only on Save (matches "open → edit → save" model).
    const [draft, setDraft] = useState(ordered);
    const [showAdd, setShowAdd] = useState(false);
    // HTML5 drag-and-drop reordering (native, no framework).
    const dragIndex = useRef(null);
    const [overIndex, setOverIndex] = useState(null);
    const providerOf = (name) => providers.find((p) => p.name === name);
    const enabledNames = new Set(providers.filter((p) => p.enabled).map((p) => p.name));
    const available = providers.filter((p) => p.enabled && !draft.includes(p.name)).map((p) => p.name);
    const move = (index, delta) => {
        const target = index + delta;
        if (target < 0 || target >= draft.length)
            return;
        const next = [...draft];
        [next[index], next[target]] = [next[target], next[index]];
        setDraft(next);
    };
    const reorder = (from, to) => {
        if (from === to || from < 0 || to < 0 || from >= draft.length || to >= draft.length)
            return;
        const next = [...draft];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setDraft(next);
    };
    const remove = (name) => {
        // First entry is the default — it can only move, never be removed.
        if (draft[0] === name)
            return;
        setDraft(draft.filter((n) => n !== name));
    };
    const makeDefault = (name) => {
        setDraft([name, ...draft.filter((n) => n !== name)]);
    };
    const add = (name) => {
        setDraft([...draft, name]);
        setShowAdd(false);
    };
    const dirty = draft.join(",") !== ordered.join(",");
    return (_jsx(Modal, { open: true, onClose: onClose, title: t("orderLabel"), closeLabel: t("close"), description: t("orderHint"), footer: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { style: { color: text.tertiary, fontSize: 12, marginRight: "auto" }, children: t("defaultFirstHint") }), _jsx(Button, { variant: "ghost", onClick: onClose, children: t("cancel") }), _jsx(Button, { variant: "primary", disabled: !dirty, onClick: () => { onSave(draft); onClose(); }, children: t("save") })] }), children: _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [draft.map((name, i) => {
                    const p = providerOf(name);
                    const ok = p !== undefined && enabledNames.has(name);
                    const isDefault = i === 0;
                    const isOver = overIndex === i && dragIndex.current !== null && dragIndex.current !== i;
                    return (_jsxs("div", { draggable: true, onDragStart: (e) => {
                            dragIndex.current = i;
                            e.dataTransfer.effectAllowed = "move";
                            // Firefox needs explicit data for the drag to start.
                            e.dataTransfer.setData("text/plain", name);
                        }, onDragOver: (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (overIndex !== i)
                                setOverIndex(i);
                        }, onDragLeave: () => {
                            if (overIndex === i)
                                setOverIndex(null);
                        }, onDrop: (e) => {
                            e.preventDefault();
                            const from = dragIndex.current;
                            dragIndex.current = null;
                            setOverIndex(null);
                            if (from !== null)
                                reorder(from, i);
                        }, onDragEnd: () => {
                            dragIndex.current = null;
                            setOverIndex(null);
                        }, style: {
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: isOver ? surface.hover : surface.layer1,
                            border: `1px solid ${isOver ? "var(--dsw-alias-brand-primary)" : surface.border}`,
                            opacity: ok ? 1 : 0.55,
                            cursor: "grab",
                        }, children: [_jsx("span", { "aria-hidden": true, style: { color: text.tertiary, fontSize: 14, cursor: "grab", userSelect: "none", flex: "none" }, title: t("moveUp"), children: "\u283F" }), _jsxs("span", { style: { color: text.tertiary, fontSize: 12, width: 18 }, children: [i + 1, "."] }), _jsx("span", { style: { color: text.primary, fontWeight: isDefault ? 600 : 400, fontSize: 14 }, children: p?.label ?? name }), isDefault && (_jsx("span", { style: { color: "var(--dsw-alias-brand-primary)", fontSize: 11, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px" }, children: t("defaultProviderLabel") })), !ok && _jsx("span", { style: { color: stateColor.danger, fontSize: 12 }, children: t("disabledLabel") }), _jsxs("span", { style: { marginLeft: "auto", display: "flex", gap: 2 }, children: [_jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconChevronUpOutline14, { size: 14 }), disabled: i === 0, onClick: () => move(i, -1), "aria-label": t("moveUp") }), _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconChevronDownOutline14, { size: 14 }), disabled: i === draft.length - 1, onClick: () => move(i, 1), "aria-label": t("moveDown") }), !isDefault && (_jsx(Button, { size: "sm", variant: "ghost", onClick: () => remove(name), "aria-label": t("removeFromChain"), children: "\u00D7" }))] })] }, name));
                }), draft.length === 0 && _jsx("span", { style: { color: text.tertiary, fontSize: 13, padding: "8px 4px" }, children: t("notConfigured") }), showAdd ? (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4, padding: "8px 4px" }, children: [available.length === 0 ? (_jsx("span", { style: { color: text.tertiary, fontSize: 13 }, children: t("noAvailableProviders") })) : (available.map((name) => {
                            const p = providerOf(name);
                            return (_jsxs("button", { type: "button", onClick: () => add(name), style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "8px 10px",
                                    background: "transparent",
                                    border: "none",
                                    borderRadius: 8,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    fontSize: 13,
                                    color: text.primary,
                                    textAlign: "left",
                                }, onMouseEnter: (e) => (e.currentTarget.style.background = surface.hover), onMouseLeave: (e) => (e.currentTarget.style.background = "transparent"), children: [_jsx(StateDot, { state: "warning", size: 8 }), _jsx("span", { children: p?.label ?? name })] }, name));
                        })), _jsx("span", { style: { marginTop: 4 }, children: _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setShowAdd(false), children: t("cancel") }) })] })) : (_jsx("div", { style: { padding: "8px 4px" }, children: _jsx(Button, { size: "sm", variant: "outline", icon: _jsx(IconPlusOutline16, { size: 14 }), onClick: () => setShowAdd(true), disabled: available.length === 0, children: t("addToChain") }) }))] }) }));
}
