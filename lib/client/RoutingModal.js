import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — Routing dialog V2 (policy selector + source order).
 *
 * Two sections:
 *  1. 使用方式 (Routing policy): 3 radio rows for ordered / round-robin / random.
 *  2. 搜索源 (Search sources): draggable list with provider logos, SVG drag handle,
 *     clean remove button, and addable-sources area.
 *
 * Props accept currentPolicy (defaults to "ordered") and currentOrder (string[]).
 * onSave(order, policy) commits in one atomic Host call.
 * @module
 */
import { useRef, useState } from "react";
import { Button, IconChevronRightOutline14, IconPlusOutline16, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import { text, surface, state as stateColor } from "./theme.js";
import { PROVIDER_BRAND } from "./brand.js";
const POLICIES = ["ordered", "round-robin", "random"];
/** 6-dot grip icon for drag handle. */
function GripIcon() {
    return (_jsxs("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "currentColor", style: { opacity: 0.45, flexShrink: 0 }, children: [_jsx("circle", { cx: "5", cy: "3", r: "1.5" }), _jsx("circle", { cx: "11", cy: "3", r: "1.5" }), _jsx("circle", { cx: "5", cy: "8", r: "1.5" }), _jsx("circle", { cx: "11", cy: "8", r: "1.5" }), _jsx("circle", { cx: "5", cy: "13", r: "1.5" }), _jsx("circle", { cx: "11", cy: "13", r: "1.5" })] }));
}
/** Close (×) icon for remove button. */
function CloseIcon() {
    return (_jsxs("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("line", { x1: "4", y1: "4", x2: "12", y2: "12" }), _jsx("line", { x1: "12", y1: "4", x2: "4", y2: "12" })] }));
}
export function RoutingModal(props) {
    const { t, providers, ordered, currentPolicy = "ordered", onClose, onSave } = props;
    const [draft, setDraft] = useState([...ordered]);
    const [policy, setPolicy] = useState(currentPolicy);
    const [showAdd, setShowAdd] = useState(false);
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
        if (draft.length <= 1)
            return;
        setDraft(draft.filter((n) => n !== name));
    };
    const add = (name) => {
        setDraft([...draft, name]);
        setShowAdd(false);
    };
    const dirty = draft.join(",") !== ordered.join(",") || policy !== currentPolicy;
    return (_jsx(Modal, { open: true, onClose: onClose, title: t("routingLabel"), closeLabel: t("close"), footer: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { style: { color: text.tertiary, fontSize: 12, marginRight: "auto" }, children: t("routingMinOneSource") }), _jsx(Button, { variant: "ghost", onClick: onClose, children: t("cancel") }), _jsx(Button, { variant: "primary", disabled: !dirty, onClick: () => { onSave(draft, policy); onClose(); }, children: t("save") })] }), children: _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, color: text.secondary }, children: t("routingPolicySection") }), _jsx("div", { role: "radiogroup", style: { display: "flex", flexDirection: "column", gap: 6 }, children: POLICIES.map((p) => {
                                const selected = policy === p;
                                return (_jsxs("button", { type: "button", role: "radio", "aria-checked": selected, tabIndex: 0, onClick: () => setPolicy(p), onKeyDown: (e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setPolicy(p);
                                        }
                                    }, style: {
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        padding: "8px 12px",
                                        borderRadius: 10,
                                        border: selected ? "1px solid var(--dsw-alias-brand-primary)" : `1px solid ${surface.border}`,
                                        background: selected ? "color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent)" : surface.layer1,
                                        cursor: "pointer",
                                        transition: "all .12s ease",
                                        textAlign: "left",
                                        fontFamily: "inherit",
                                        outline: "none",
                                    }, children: [_jsx("div", { style: {
                                                width: 16,
                                                height: 16,
                                                borderRadius: "50%",
                                                border: selected ? "5px solid var(--dsw-alias-brand-primary)" : `2px solid ${surface.border}`,
                                                boxSizing: "border-box",
                                                flexShrink: 0,
                                                transition: "all .12s ease",
                                            } }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 1 }, children: [_jsx("span", { style: { fontSize: 13, fontWeight: selected ? 600 : 500, color: text.primary }, children: t(`routingPolicy.${p}`) }), _jsx("span", { style: { fontSize: 11, color: text.tertiary }, children: t(`routingPolicyHint.${p}`) })] })] }, p));
                            }) })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, color: text.secondary }, children: t("routingSourcesSection") }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: draft.map((name, i) => {
                                const p = providerOf(name);
                                const ok = p !== undefined && enabledNames.has(name);
                                const isDefault = i === 0 && policy === "ordered";
                                const isOver = overIndex === i && dragIndex.current !== null && dragIndex.current !== i;
                                const brand = p ? PROVIDER_BRAND[p.name] : undefined;
                                return (_jsxs("div", { draggable: true, onDragStart: (e) => { dragIndex.current = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", name); }, onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overIndex !== i)
                                        setOverIndex(i); }, onDragLeave: () => { if (overIndex === i)
                                        setOverIndex(null); }, onDrop: (e) => { e.preventDefault(); const from = dragIndex.current; dragIndex.current = null; setOverIndex(null); if (from !== null)
                                        reorder(from, i); }, onDragEnd: () => { dragIndex.current = null; setOverIndex(null); }, style: {
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        background: isOver ? surface.hover : surface.layer1,
                                        border: `1px solid ${isOver ? "var(--dsw-alias-brand-primary)" : surface.border}`,
                                        opacity: ok ? 1 : 0.5,
                                        cursor: "grab",
                                    }, children: [_jsx(GripIcon, {}), brand && _jsx("img", { src: brand.icon, alt: "", width: 18, height: 18, style: { borderRadius: 4, flexShrink: 0 } }), _jsx("span", { style: { color: text.primary, fontWeight: isDefault ? 600 : 400, fontSize: 14, flex: 1 }, children: p?.label ?? name }), !ok && _jsx("span", { style: { color: stateColor.danger, fontSize: 12 }, children: t("disabledLabel") }), isDefault && (_jsx("span", { style: { color: "var(--dsw-alias-brand-primary)", fontSize: 11, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px", whiteSpace: "nowrap" }, children: t("preferredProviderLabel") })), _jsx("button", { onClick: (e) => { e.stopPropagation(); remove(name); }, disabled: draft.length <= 1, "aria-label": t("removeFromChain"), style: {
                                                width: 22,
                                                height: 22,
                                                padding: 0,
                                                border: "none",
                                                background: "transparent",
                                                color: draft.length <= 1 ? "transparent" : text.tertiary,
                                                cursor: draft.length <= 1 ? "default" : "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                borderRadius: 3,
                                            }, children: draft.length > 1 && _jsx(CloseIcon, {}) })] }, name));
                            }) }), draft.length === 0 && _jsx("span", { style: { color: text.tertiary, fontSize: 13, padding: "8px 4px" }, children: t("notConfigured") }), showAdd ? (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4, padding: "8px 4px" }, children: [available.length === 0 ? (_jsx("span", { style: { color: text.tertiary, fontSize: 13 }, children: t("noAvailableProviders") })) : (available.map((name) => {
                                    const p = providerOf(name);
                                    const brand = p ? PROVIDER_BRAND[p.name] : undefined;
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
                                        }, onMouseEnter: (e) => (e.currentTarget.style.background = surface.hover), onMouseLeave: (e) => (e.currentTarget.style.background = "transparent"), children: [brand && _jsx("img", { src: brand.icon, alt: "", width: 16, height: 16, style: { borderRadius: 3, flexShrink: 0 } }), _jsx("span", { children: p?.label ?? name })] }, name));
                                })), _jsx("span", { style: { marginTop: 4 }, children: _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setShowAdd(false), children: t("cancel") }) })] })) : (_jsx("div", { style: { padding: "4px 0" }, children: _jsx(Button, { size: "sm", variant: "outline", icon: _jsx(IconPlusOutline16, { size: 14 }), onClick: () => setShowAdd(true), disabled: available.length === 0, children: t("addToChain") + " · " + t("routingAvailableSources") }) }))] })] }) }));
}
