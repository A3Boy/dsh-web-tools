import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * dsh-web-tools — P4 Search Preferences (ProviderPreferencesSection).
 *
 * Modern single-select preference UI replacing the old white <select> form.
 *
 * Rules enforced here:
 *  - primary provider mode  -> ChoiceCard (role=radio), never native <select>
 *  - boolean                -> Switch
 *  - small secondary choice -> segmented control (inline pill buttons)
 *  - rare numeric           -> "更多设置" reveal only
 *  - collapsed row is clickable, shows current summary + 推荐 / 已自定义 pill
 *  - action row (已修改 N 项 / 恢复推荐 / 保存) appears only while dirty
 *
 * Wire contract unchanged: draft holds raw provider-native overrides; save
 * posts them to provider-options/set, reset deletes the override.
 * @module
 */
import { useState } from "react";
import { Button, IconChevronRightOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "../api.js";
import { text, surface, state as stateColor } from "../theme.js";
import { ChoiceCard } from "./ChoiceCard.js";
import { formatProviderOptionsSummary } from "../logic.js";
import { Switch } from "../WebToolsSection.js";
/** Collapsed pill: 推荐 (brand) or 已自定义 (neutral). */
function Pill(props) {
    if (props.kind === "none")
        return null;
    const isRecommend = props.kind === "recommend";
    const color = isRecommend ? "var(--dsw-alias-brand-primary)" : text.tertiary;
    const bg = isRecommend ? "color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)" : surface.layer2;
    return (_jsx("span", { style: {
            display: "inline-flex",
            alignItems: "center",
            fontSize: 11,
            lineHeight: 1,
            padding: "3px 8px",
            borderRadius: 999,
            border: `1px solid ${color}55`,
            background: bg,
            color,
            fontWeight: 600,
            whiteSpace: "nowrap",
        }, children: isRecommend ? "推荐" : "已自定义" }));
}
/** Small inline segmented control (fast/instant, deep-lite/…, freshness presets). */
function Segmented(props) {
    const { options, value, onChange, disabled } = props;
    return (_jsx("div", { role: "radiogroup", style: { display: "flex", gap: 4, flexWrap: "wrap" }, children: options.map((o) => {
            const selected = o.value === value;
            return (_jsx("button", { type: "button", role: "radio", "aria-checked": selected, disabled: disabled, title: o.title, onClick: () => onChange(o.value), style: {
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 999,
                    cursor: disabled ? "not-allowed" : "pointer",
                    border: `1px solid ${selected ? "var(--dsw-alias-brand-primary)" : surface.border}`,
                    background: selected ? "color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)" : surface.layer2,
                    color: selected ? "var(--dsw-alias-label-primary)" : text.secondary,
                    fontFamily: "inherit",
                    outline: "none",
                }, children: o.label }, o.value));
        }) }));
}
/** Standard number input (advanced settings only). */
function NumberField(props) {
    const { label, hint, value, placeholder, onChange } = props;
    return (_jsxs("label", { style: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: text.secondary }, children: [_jsx("span", { children: label }), _jsx("input", { type: "number", value: value, placeholder: placeholder, onChange: (e) => onChange(e.target.value), style: {
                    padding: "5px 9px",
                    borderRadius: 7,
                    border: `1px solid ${surface.border}`,
                    background: surface.layer2,
                    color: text.primary,
                    fontFamily: "inherit",
                    fontSize: 13,
                    width: 120,
                } }), hint && _jsx("span", { style: { color: text.tertiary, fontSize: 11 }, children: hint })] }));
}
export function ProviderPreferencesSection(props) {
    const { p, onConfigChanged } = props;
    const isExcluded = p.name === "jina" || p.name === "searxng";
    if (isExcluded || !p.options) {
        // Jina/SearXNG expose no user-facing native options.
        return null;
    }
    return _jsx(PreferencesBody, { p: p, onConfigChanged: onConfigChanged }, p.name);
}
/** Body keyed by provider: draft state is rebuilt per provider entry. */
function PreferencesBody(props) {
    const { p, onConfigChanged } = props;
    const [expanded, setExpanded] = useState(false);
    const seed = { ...(p.options?.overrides ?? {}) };
    const [draft, setDraft] = useState(seed);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);
    const eff = p.options.effective;
    const isDef = p.options.isDefault;
    const savedOverrides = p.options.overrides ?? {};
    /** Write one raw override; drop it when it equals the provider default. */
    const setValue = (key, value, defaultValue) => {
        setDraft((prev) => {
            const next = { ...prev };
            if (value === defaultValue)
                delete next[key];
            else
                next[key] = value;
            return next;
        });
    };
    // Dirty = draft differs from the persisted overrides (only user edits count).
    const dirtyKeys = Object.keys(draft).filter((k) => draft[k] !== savedOverrides[k]);
    const dirty = dirtyKeys.length > 0;
    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            await api.providerOptionsSet(p.name, draft);
            onConfigChanged();
            setMsg("已保存");
            window.setTimeout(() => setMsg(null), 2000);
        }
        catch {
            setMsg("保存失败");
        }
        finally {
            setSaving(false);
        }
    };
    const handleReset = async () => {
        setSaving(true);
        setMsg(null);
        try {
            await api.providerOptionsReset(p.name);
            setDraft({});
            onConfigChanged();
            setMsg("已恢复推荐");
            window.setTimeout(() => setMsg(null), 2000);
        }
        catch {
            setMsg("恢复失败");
        }
        finally {
            setSaving(false);
        }
    };
    const summary = formatProviderOptionsSummary(p.name, eff);
    const pillKind = !isDef ? "custom" : expanded ? "recommend" : "recommend";
    return (_jsxs("div", { style: { marginTop: 16, borderTop: `1px solid ${surface.border}`, paddingTop: 14 }, children: [_jsxs("div", { role: "button", tabIndex: 0, "aria-expanded": expanded, onClick: () => setExpanded(!expanded), onKeyDown: (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpanded(!expanded);
                    }
                }, style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    borderRadius: 8,
                    padding: "2px 4px",
                    margin: "-2px -4px",
                    outline: "none",
                }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 13, color: text.primary }, children: "\u641C\u7D22\u504F\u597D" }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 2, minWidth: 0 }, children: [_jsx("span", { style: { fontSize: 12, color: text.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: summary }), _jsx(Pill, { kind: pillKind })] })] }), _jsx("span", { style: { transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s ease", flex: "none", color: text.tertiary, display: "inline-flex" }, children: _jsx(IconChevronRightOutline14, { size: 14 }) })] }), expanded && (_jsxs("div", { style: { marginTop: 12, display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }, children: [_jsx(ProviderControls, { provider: p.name, draft: draft, setValue: setValue, eff: eff }), dirty && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 2, paddingTop: 10, borderTop: `1px solid ${surface.border}` }, children: [_jsxs("span", { style: { fontSize: 12, color: text.secondary }, children: ["\u5DF2\u4FEE\u6539 ", dirtyKeys.length, " \u9879"] }), _jsxs("span", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }, children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: handleReset, disabled: saving, children: "\u6062\u590D\u63A8\u8350" }), _jsx(Button, { size: "sm", variant: "primary", onClick: handleSave, disabled: saving, children: saving ? "保存中..." : "保存" })] })] })), msg && _jsx("div", { style: { fontSize: 12, color: stateColor.success, textAlign: "right" }, children: msg })] }))] }));
}
/** Per-provider control panels — human-language cards over native options. */
function ProviderControls(props) {
    const { provider, draft, setValue, eff } = props;
    const raw = (key, fallback) => draft[key] ?? fallback;
    switch (provider) {
        // ------------------------------------------------------------------ Exa
        case "exa": {
            const searchType = String(raw("searchType", "auto"));
            const group = searchType === "fast" || searchType === "instant"
                ? "speed"
                : searchType.startsWith("deep")
                    ? "deep"
                    : "auto";
            const maxAgeHours = raw("maxAgeHours", undefined);
            const freshness = maxAgeHours === 0 ? "live" : maxAgeHours === -1 ? "cache" : "auto";
            return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: "\u641C\u7D22\u65B9\u5F0F" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }, children: [_jsx(ChoiceCard, { selected: group === "auto", title: "\u81EA\u52A8\u5E73\u8861", description: "\u5927\u591A\u6570\u641C\u7D22\u7684\u6700\u4F73\u9009\u62E9", badge: "\u63A8\u8350", onClick: () => setValue("searchType", "auto", "auto") }), _jsx(ChoiceCard, { selected: group === "speed", title: "\u5FEB\u901F\u54CD\u5E94", description: "\u66F4\u4F4E\u5EF6\u8FDF\uFF0C\u9002\u5408\u7B80\u5355\u3001\u660E\u786E\u95EE\u9898", onClick: () => setValue("searchType", "fast", "auto") }), _jsx(ChoiceCard, { selected: group === "deep", title: "\u6DF1\u5EA6\u68C0\u7D22", description: "\u590D\u6742\u95EE\u9898 \u00B7 \u8F83\u6162", onClick: () => setValue("searchType", "deep-lite", "auto") })] }), group === "speed" && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 2 }, children: [_jsx("span", { style: { fontSize: 12, color: text.secondary }, children: "\u901F\u5EA6" }), _jsx(Segmented, { options: [
                                            { value: "fast", label: "快速" },
                                            { value: "instant", label: "极速" },
                                        ], value: String(raw("searchType", "fast")), onChange: (v) => setValue("searchType", v, "auto") })] })), group === "deep" && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 2 }, children: [_jsx("span", { style: { fontSize: 12, color: text.secondary }, children: "\u6DF1\u5EA6" }), _jsx(Segmented, { options: [
                                            { value: "deep-lite", label: "轻量" },
                                            { value: "deep", label: "深入" },
                                            { value: "deep-reasoning", label: "推理" },
                                        ], value: String(raw("searchType", "deep-lite")), onChange: (v) => setValue("searchType", v, "auto") })] }))] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: "\u5185\u5BB9\u65B0\u9C9C\u5EA6" }), _jsx(Segmented, { options: [
                                    { value: "auto", label: "自动", title: "由 Exa 平衡缓存和实时抓取" },
                                    { value: "live", label: "始终刷新", title: "内容更新，但速度更慢" },
                                    { value: "cache", label: "仅缓存", title: "速度最快，可能不是最新" },
                                ], value: freshness, onChange: (v) => {
                                    if (v === "auto")
                                        setValue("maxAgeHours", undefined, undefined);
                                    else if (v === "live")
                                        setValue("maxAgeHours", 0, undefined);
                                    else
                                        setValue("maxAgeHours", -1, undefined);
                                } }), _jsx(AdvancedDelay, { children: _jsx(NumberField, { label: "\u81EA\u5B9A\u4E49\u7F13\u5B58\u6700\u5927\u5E74\u9F84\uFF08\u5C0F\u65F6\uFF0C\u7559\u7A7A\u7528\u81EA\u52A8\uFF09", hint: "\u4F8B\u5982 24 = \u4F18\u5148\u4F7F\u7528 24 \u5C0F\u65F6\u5185\u7684\u7F13\u5B58", value: typeof draft.maxAgeHours === "number" ? String(draft.maxAgeHours) : "", onChange: (v) => {
                                        const n = Number(v);
                                        if (v === "" || Number.isNaN(n))
                                            setValue("maxAgeHours", undefined, undefined);
                                        else
                                            setValue("maxAgeHours", Math.round(n), undefined);
                                    } }) })] })] }));
        }
        // --------------------------------------------------------------- Tavily
        case "tavily": {
            const autoParams = raw("autoParameters", false) === true;
            // When autoParameters is on, the explicit mode cards are disabled.
            return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: "\u641C\u7D22\u6DF1\u5EA6" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }, children: [_jsx(ChoiceCard, { selected: !autoParams && raw("searchDepth", "basic") === "basic", title: "\u5E73\u8861", description: "\u65E5\u5E38\u641C\u7D22", badge: "\u63A8\u8350", meta: "1 credit", disabled: autoParams, onClick: () => setValue("searchDepth", "basic", "basic") }), _jsx(ChoiceCard, { selected: !autoParams && raw("searchDepth", "basic") === "advanced", title: "\u9AD8\u8D28\u91CF", description: "\u66F4\u9AD8\u76F8\u5173\u6027", meta: "2 credits", disabled: autoParams, onClick: () => setValue("searchDepth", "advanced", "basic") }), _jsx(ChoiceCard, { selected: !autoParams && raw("searchDepth", "basic") === "fast", title: "\u5FEB\u901F", description: "\u66F4\u4F4E\u5EF6\u8FDF", meta: "1 credit", disabled: autoParams, onClick: () => setValue("searchDepth", "fast", "basic") }), _jsx(ChoiceCard, { selected: !autoParams && raw("searchDepth", "basic") === "ultra-fast", title: "\u6781\u901F", description: "\u6700\u4F4E\u5EF6\u8FDF", meta: "1 credit", disabled: autoParams, onClick: () => setValue("searchDepth", "ultra-fast", "basic") })] })] }), _jsx(AdvancedDelay, { children: _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(Switch, { checked: autoParams, onChange: (v) => setValue("autoParameters", v, false), label: "\u667A\u80FD\u8C03\u53C2" }), _jsxs("span", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("span", { style: { fontSize: 13, color: text.primary }, children: "\u667A\u80FD\u8C03\u53C2" }), _jsx("span", { style: { fontSize: 12, color: text.secondary }, children: autoParams ? "开启·成本可能变化（部分查询可能用高质量 2 credits）" : "允许 Tavily 根据问题自动优化搜索参数" })] })] }) })] }));
        }
        // ---------------------------------------------------------------- Brave
        case "brave": {
            const pref = String(raw("endpointPreference", "auto"));
            return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: "\u68C0\u7D22\u6A21\u5F0F" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }, children: [_jsx(ChoiceCard, { selected: pref === "auto", title: "\u667A\u80FD\u4E0A\u4E0B\u6587", description: "\u4E3A AI \u8FD4\u56DE\u9AD8\u76F8\u5173\u7247\u6BB5", badge: "\u63A8\u8350", onClick: () => setValue("endpointPreference", "auto", "auto") }), _jsx(ChoiceCard, { selected: pref === "web-search", title: "\u4F20\u7EDF\u7F51\u9875\u641C\u7D22", description: "\u6807\u51C6 Brave Search \u7ED3\u679C", onClick: () => setValue("endpointPreference", "web-search", "auto") })] })] }), _jsxs(AdvancedDelay, { children: [_jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(Switch, { checked: pref === "llm-context", onChange: (v) => setValue("endpointPreference", v ? "llm-context" : "auto", "auto"), label: "\u4EC5\u667A\u80FD\u4E0A\u4E0B\u6587" }), _jsx("span", { style: { fontSize: 12, color: text.secondary }, children: "\u4E0D\u81EA\u52A8\u56DE\u9000\u5230\u4F20\u7EDF\u641C\u7D22\uFF08\u9AD8\u7EA7\uFF09" })] }), _jsx(Segmented, { options: [
                                    { value: "balanced", label: "自动" },
                                    { value: "strict", label: "标准" },
                                    { value: "lenient", label: "较多" },
                                ], value: String(raw("contextThresholdMode", "balanced")), onChange: (v) => setValue("contextThresholdMode", v, "balanced") })] })] }));
        }
        // ---------------------------------------------------------------- You.com
        case "you": {
            const ext = String(raw("extractionMode", "highlights"));
            return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: "\u641C\u7D22\u7ED3\u679C" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }, children: [_jsx(ChoiceCard, { selected: ext === "highlights", title: "AI \u76F8\u5173\u7247\u6BB5", description: "\u66F4\u9002\u5408 AI \u56DE\u7B54\u95EE\u9898", badge: "\u63A8\u8350", onClick: () => setValue("extractionMode", "highlights", "highlights") }), _jsx(ChoiceCard, { selected: ext === "none", title: "\u7B80\u77ED\u6458\u8981", description: "\u66F4\u8F7B\u91CF\uFF0C\u8FD4\u56DE\u4F20\u7EDF\u641C\u7D22\u6458\u8981", onClick: () => setValue("extractionMode", "none", "highlights") })] })] }), _jsx(AdvancedDelay, { children: _jsxs("div", { style: { display: "flex", gap: 14, flexWrap: "wrap" }, children: [_jsx(NumberField, { label: "\u9875\u9762\u8BFB\u53D6\u8D85\u65F6\uFF08\u79D2\uFF09", value: typeof draft.fetchCrawlTimeoutSec === "number" ? String(draft.fetchCrawlTimeoutSec) : "", onChange: (v) => {
                                        const n = Number(v);
                                        if (v === "" || Number.isNaN(n))
                                            setValue("fetchCrawlTimeoutSec", undefined, undefined);
                                        else
                                            setValue("fetchCrawlTimeoutSec", Math.round(n), undefined);
                                    } }), _jsx(NumberField, { label: "\u7F13\u5B58\u65B0\u9C9C\u5EA6\uFF08\u79D2\uFF0C0 = \u59CB\u7EC8\u5237\u65B0\uFF09", value: typeof draft.fetchMaxAgeSec === "number" ? String(draft.fetchMaxAgeSec) : "", onChange: (v) => {
                                        const n = Number(v);
                                        if (v === "" || Number.isNaN(n))
                                            setValue("fetchMaxAgeSec", undefined, undefined);
                                        else
                                            setValue("fetchMaxAgeSec", Math.round(n), undefined);
                                    } })] }) })] }));
        }
        // ------------------------------------------------------------ Firecrawl
        case "firecrawl": {
            const onlyMain = raw("fetchOnlyMainContent", true) !== false;
            const maxAge = raw("fetchMaxAgeMs", undefined);
            const cacheKind = maxAge === 0 ? "live" : maxAge === 86400000 ? "day" : maxAge === 604800000 ? "week" : "auto";
            return (_jsxs(_Fragment, { children: [_jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(Switch, { checked: onlyMain, onChange: (v) => setValue("fetchOnlyMainContent", v, true), label: "\u53EA\u4FDD\u7559\u6B63\u6587" }), _jsxs("span", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("span", { style: { fontSize: 13, color: text.primary }, children: "\u53EA\u4FDD\u7559\u6B63\u6587" }), _jsx("span", { style: { fontSize: 12, color: text.secondary }, children: "\u53BB\u6389\u5BFC\u822A\u3001\u9875\u811A\u7B49\u5916\u56F4\u5185\u5BB9" })] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: "\u9875\u9762\u7F13\u5B58" }), _jsx(Segmented, { options: [
                                    { value: "auto", label: "智能缓存", title: "由 Firecrawl 平衡缓存与实时抓取" },
                                    { value: "live", label: "始终刷新" },
                                    { value: "day", label: "缓存 1 天" },
                                    { value: "week", label: "缓存 7 天" },
                                ], value: cacheKind, onChange: (v) => {
                                    if (v === "auto")
                                        setValue("fetchMaxAgeMs", undefined, undefined);
                                    else if (v === "live")
                                        setValue("fetchMaxAgeMs", 0, undefined);
                                    else if (v === "day")
                                        setValue("fetchMaxAgeMs", 86400000, undefined);
                                    else
                                        setValue("fetchMaxAgeMs", 604800000, undefined);
                                } })] })] }));
        }
        // -------------------------------------------------------------- Parallel
        case "parallel": {
            const mode = String(raw("mode", "advanced"));
            return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: "\u641C\u7D22\u8D28\u91CF" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }, children: [_jsx(ChoiceCard, { selected: mode === "advanced", title: "\u9AD8\u8D28\u91CF", description: "\u66F4\u9002\u5408\u590D\u6742\u641C\u7D22", badge: "\u63A8\u8350", onClick: () => setValue("mode", "advanced", "advanced") }), _jsx(ChoiceCard, { selected: mode === "basic", title: "\u5E73\u8861", description: "\u4F4E\u5EF6\u8FDF\uFF0C\u9002\u5408\u660E\u786E\u95EE\u9898", onClick: () => setValue("mode", "basic", "advanced") }), _jsx(ChoiceCard, { selected: mode === "fast", title: "\u5FEB\u901F", description: "1 \u79D2\u5EF6\u8FDF\u9884\u7B97\u5185\u7684\u9AD8\u8D28\u91CF", onClick: () => setValue("mode", "fast", "advanced") }), _jsx(ChoiceCard, { selected: mode === "turbo", title: "\u6781\u901F", description: "\u7EA6 200ms \u9AD8\u541E\u5410", onClick: () => setValue("mode", "turbo", "advanced") })] })] }), _jsx(AdvancedDelay, { children: _jsx(Segmented, { options: [
                                { value: "auto", label: "自动" },
                                { value: "10000", label: "精简" },
                                { value: "25000", label: "标准" },
                                { value: "50000", label: "较多" },
                            ], value: typeof draft.maxCharsTotal === "number"
                                ? String(draft.maxCharsTotal)
                                : "auto", onChange: (v) => {
                                if (v === "auto")
                                    setValue("maxCharsTotal", undefined, undefined);
                                else
                                    setValue("maxCharsTotal", Number(v), undefined);
                            } }) })] }));
        }
        default:
            return null;
    }
}
function SectionLabel(props) {
    return _jsx("span", { style: { fontSize: 12, fontWeight: 600, color: text.secondary }, children: props.children });
}
/** "更多设置" collapsible — advanced numeric / niche knobs stay hidden. */
function AdvancedDelay(props) {
    const [open, setOpen] = useState(false);
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [_jsxs("button", { type: "button", onClick: () => setOpen(!open), style: {
                    alignSelf: "flex-start",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 0",
                    fontSize: 12,
                    border: "none",
                    background: "transparent",
                    color: text.secondary,
                    cursor: "pointer",
                    fontFamily: "inherit",
                }, children: [_jsx("span", { style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", display: "inline-flex" }, children: _jsx(IconChevronRightOutline14, { size: 12 }) }), "\u66F4\u591A\u8BBE\u7F6E"] }), open && _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: 8, borderRadius: 8, background: surface.layer1 }, children: props.children })] }));
}
