import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * dsh-web-tools — P4 Search Preferences (ProviderPreferencesSection).
 *
 * Modern single-select preference UI replacing the old white <select> form.
 *
 * Wire contract unchanged: draft holds raw provider-native overrides; save
 * posts them to provider-options/set, reset deletes the override.
 * @module
 */
import { useEffect, useMemo, useState } from "react";
import { Button, IconChevronRightOutline14, IconChevronDownOutline14, Menu } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "../api.js";
import { text, surface, state as stateColor } from "../theme.js";
import { Switch } from "../WebToolsSection.js";
import { SegmentedControl } from "../ui/SegmentedControl.js";
import { tavilyChunksVisible, PARALLEL_PRIMARY_MODES, PARALLEL_EXPERIMENTAL_MODES, EXA_SEARCH_TYPE_OPTIONS, exaPrimaryMode, exaPrimaryApplyable } from "./contracts.js";
import { adoptWebToolsStyles } from "../ui/styles.js";
/** Modern Setting row input field with optional trailing addon/unit. */
function SettingInputRow(props) {
    const { label, hint, value, unit, placeholder, onChange } = props;
    return (_jsxs("div", { className: "dswt-input-row", children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("span", { className: "dswt-pref-label", children: label }), hint && _jsx("span", { style: { fontSize: 12, color: text.tertiary }, children: hint })] }), _jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }, children: [_jsx("input", { type: "number", value: value, placeholder: placeholder, onChange: (e) => onChange(e.target.value), className: "dswt-input-num" }), unit && _jsx("span", { style: { fontSize: 13, color: text.secondary }, children: unit })] })] }));
}
/** Dropdown menu trigger for selecting expert options (>4 items). */
function DropdownSelect(props) {
    const { label, valueLabel, items, onSelect } = props;
    const [open, setOpen] = useState(false);
    return (_jsxs("div", { className: "dswt-input-row", children: [_jsx("span", { className: "dswt-pref-label", children: label }), _jsx(Menu, { open: open, onClose: () => setOpen(false), items: items, onSelect: (id) => {
                    onSelect(id);
                    setOpen(false);
                }, anchor: _jsxs("button", { type: "button", onClick: () => setOpen(!open), className: "dswt-dropdown-btn", children: [_jsx("span", { children: valueLabel }), _jsx("span", { style: { display: "inline-flex", color: text.tertiary }, children: _jsx(IconChevronDownOutline14, { size: 14 }) })] }) })] }));
}
export function ProviderPreferencesSection(props) {
    adoptWebToolsStyles();
    const { t, p, onConfigChanged, onRestoreDraft, onCustomizedChange } = props;
    if (p.name === "searxng" || !p.options)
        return null;
    return (_jsx(PreferencesBody, { t: t, p: p, onConfigChanged: onConfigChanged, onRestoreDraft: onRestoreDraft, onCustomizedChange: onCustomizedChange }, p.name));
}
function PreferencesBody(props) {
    const { t, p, onConfigChanged, onRestoreDraft, onCustomizedChange } = props;
    const [draft, setDraft] = useState(() => ({ ...(p.options?.overrides ?? {}) }));
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);
    // Sync draft whenever upstream options change from external reload or save
    useEffect(() => {
        setDraft({ ...(p.options?.overrides ?? {}) });
    }, [p.options?.overrides]);
    const eff = p.options.effective;
    const isDef = p.options.isDefault;
    const savedOverrides = useMemo(() => p.options?.overrides ?? {}, [p.options?.overrides]);
    const isCustomized = !isDef || Object.keys(draft).length > 0;
    useEffect(() => {
        onCustomizedChange?.(isCustomized);
    }, [isCustomized, onCustomizedChange]);
    const setValue = (key, value, defaultValue) => {
        setMsg(null);
        setDraft((prev) => {
            const next = { ...prev };
            if (value === defaultValue)
                delete next[key];
            else
                next[key] = value;
            return next;
        });
    };
    const allKeys = new Set([...Object.keys(draft), ...Object.keys(savedOverrides)]);
    const dirtyKeys = [...allKeys].filter((key) => !Object.is(draft[key], savedOverrides[key]));
    const dirty = dirtyKeys.length > 0;
    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await api.providerOptionsSet(p.name, draft);
            if (res?.options?.overrides) {
                setDraft({ ...res.options.overrides });
            }
            await onConfigChanged();
            // On success, remain silent per design spec (no green "已保存" bar)
        }
        catch {
            setMsg({ text: t("prefsSaveFailed"), tone: "error" });
        }
        finally {
            setSaving(false);
        }
    };
    const handleCancel = () => { setDraft({ ...savedOverrides }); setMsg(null); };
    const handleResetToDefaults = () => {
        setDraft({});
        setMsg(null);
    };
    useEffect(() => {
        if (onRestoreDraft) {
            onRestoreDraft(handleResetToDefaults);
        }
    }, [onRestoreDraft]);
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }, children: [_jsx(ProviderControls, { t: t, provider: p.name, draft: draft, setValue: setValue, eff: eff, isCustomized: isCustomized, onRestoreDefault: handleResetToDefaults }), dirty && (_jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: surface.layer2,
                    marginTop: 4,
                }, children: [_jsx("span", { style: { fontSize: 12, color: text.secondary }, children: t("prefsModified", { n: dirtyKeys.length }) }), _jsxs("span", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }, children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: handleCancel, disabled: saving, children: t("prefsCancel") }), _jsx(Button, { size: "sm", variant: "primary", onClick: handleSave, disabled: saving, children: saving ? t("prefsSaving") : t("prefsSave") })] })] })), msg && msg.tone === "error" && (_jsx("div", { style: { fontSize: 12, color: stateColor.danger, textAlign: "right" }, children: msg.text }))] }));
}
/** Per-provider control panels — fully i18n, Segmented single-choice with active description. */
function ProviderControls(props) {
    const { t, provider, draft, setValue } = props;
    const raw = (key, fallback) => draft[key] ?? fallback;
    switch (provider) {
        // ------------------------------------------------------------------ Exa
        case "exa": {
            const mode = String(raw("searchType", "auto"));
            const desc = mode === "fast" ? t("prefsExaFastDesc") : mode === "instant" ? t("prefsFastDesc") : mode.startsWith("deep") ? t("prefsExaDeepDesc") : t("prefsExaAutoDesc");
            const maxAgeHours = raw("maxAgeHours", undefined);
            const freshness = maxAgeHours === 0 ? "live" : maxAgeHours === -1 ? "cache" : "auto";
            const handlePrimaryMode = (v) => {
                if (!exaPrimaryApplyable(v, mode))
                    return;
                setValue("searchType", v, "auto");
            };
            const primaryValue = exaPrimaryMode(mode);
            const exaNativeItems = EXA_SEARCH_TYPE_OPTIONS.map((m) => {
                const keyHint = {
                    auto: "Auto",
                    fast: "Fast",
                    instant: "Instant",
                    "deep-lite": "DeepLite",
                    deep: "Deep",
                    "deep-reasoning": "DeepReasoning",
                };
                return {
                    id: m,
                    label: t(`prefsExaNative${keyHint[m]}`),
                };
            });
            const currentNativeLabel = (() => {
                const keyHint = {
                    auto: "Auto",
                    fast: "Fast",
                    instant: "Instant",
                    "deep-lite": "DeepLite",
                    deep: "Deep",
                    "deep-reasoning": "DeepReasoning",
                };
                return t(`prefsExaNative${keyHint[mode] ?? "Auto"}`);
            })();
            return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsExaModeLabel") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                                    { value: "auto", label: t("prefsExaAuto") },
                                    { value: "fast", label: t("prefsFast") },
                                    { value: "deep", label: t("prefsDeep") },
                                ], value: primaryValue, onChange: handlePrimaryMode }), _jsx("div", { className: "dswt-pref-desc", children: _jsx("span", { children: desc }) })] }), _jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsExaFreshnessLabel") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                                    { value: "auto", label: t("prefsFreshnessAuto") },
                                    { value: "live", label: t("prefsFreshnessLive") },
                                    { value: "cache", label: t("prefsFreshnessCache") },
                                ], value: freshness, onChange: (v) => {
                                    if (v === "auto")
                                        setValue("maxAgeHours", undefined, undefined);
                                    else if (v === "live")
                                        setValue("maxAgeHours", 0, undefined);
                                    else
                                        setValue("maxAgeHours", -1, undefined);
                                } })] }), _jsxs(AdvancedDelay, { t: t, children: [_jsx(DropdownSelect, { label: t("prefsExaNativeLabel"), valueLabel: currentNativeLabel, items: exaNativeItems, onSelect: (id) => setValue("searchType", id, "auto") }), _jsx(SettingInputRow, { label: t("prefsExaMaxAgeLabel"), unit: t("prefsHoursUnit"), value: typeof draft.maxAgeHours === "number" && draft.maxAgeHours > 0 ? String(draft.maxAgeHours) : "", placeholder: "24", onChange: (v) => {
                                    const n = Number(v);
                                    if (v === "" || Number.isNaN(n))
                                        setValue("maxAgeHours", undefined, undefined);
                                    else
                                        setValue("maxAgeHours", Math.round(n), undefined);
                                } })] })] }));
        }
        // --------------------------------------------------------------- Tavily
        case "tavily": {
            const autoParams = raw("autoParameters", false) === true;
            const depth = String(raw("searchDepth", "basic"));
            const desc = depth === "advanced" ? t("prefsTavilyAdvancedDesc") : depth === "fast" ? t("prefsTavilyFastDesc") : depth === "ultra-fast" ? t("prefsTavilyUltraFastDesc") : t("prefsTavilyBasicDesc");
            return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsTavilyDepthLabel") }), _jsx(SegmentedControl, { disabled: autoParams, style: { width: "100%" }, options: [
                                    { value: "basic", label: t("prefsTavilyBasic") },
                                    { value: "advanced", label: t("prefsTavilyAdvanced") },
                                    { value: "fast", label: t("prefsTavilyFast") },
                                    { value: "ultra-fast", label: t("prefsTavilyUltraFast") },
                                ], value: depth, onChange: (v) => setValue("searchDepth", v, "basic") }), !autoParams && (_jsx("div", { className: "dswt-pref-desc", children: _jsx("span", { children: desc }) }))] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(Switch, { checked: autoParams, onChange: (v) => setValue("autoParameters", v, false), label: t("prefsTavilyAutoParams") }), _jsxs("span", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("span", { style: { fontSize: 13, color: text.primary }, children: t("prefsTavilyAutoParams") }), _jsx("span", { style: { fontSize: 12, color: text.secondary }, children: t("prefsTavilyAutoParamsDesc") })] })] }), _jsxs(AdvancedDelay, { t: t, children: [tavilyChunksVisible(depth, autoParams) && (_jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsTavilyChunksPerSource") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [{ value: "auto", label: t("prefsAutoLabel") }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }], value: typeof draft.chunksPerSource === "number" ? String(draft.chunksPerSource) : "auto", onChange: (v) => { if (v === "auto")
                                            setValue("chunksPerSource", undefined, undefined);
                                        else
                                            setValue("chunksPerSource", Number(v), undefined); } })] })), _jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsTavilyExtractDepth") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [{ value: "basic", label: t("prefsExtractBasic") }, { value: "advanced", label: t("prefsExtractAdvanced") }], value: String(raw("fetchExtractDepth", "basic")), onChange: (v) => setValue("fetchExtractDepth", v, "basic") })] })] })] }));
        }
        // ---------------------------------------------------------------- Brave
        case "brave": {
            const pref = String(raw("endpointPreference", "auto"));
            const desc = pref === "llm-context" ? t("prefsBraveLlmContextDesc") : pref === "web-search" ? t("prefsBraveWebSearchDesc") : t("prefsBraveAutoDesc");
            return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsBraveModeLabel") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                                    { value: "auto", label: t("prefsBraveAuto") },
                                    { value: "llm-context", label: t("prefsBraveLlmContext") },
                                    { value: "web-search", label: t("prefsBraveWebSearch") },
                                ], value: pref, onChange: (v) => setValue("endpointPreference", v, "auto") }), _jsx("div", { className: "dswt-pref-desc", children: _jsx("span", { children: desc }) })] }), _jsxs(AdvancedDelay, { t: t, children: [_jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsBraveThreshold") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                                            { value: "balanced", label: t("prefsBraveThresholdBalanced") },
                                            { value: "strict", label: t("prefsBraveThresholdStrict") },
                                            { value: "lenient", label: t("prefsBraveThresholdLenient") },
                                            { value: "disabled", label: t("prefsBraveThresholdOff") },
                                        ], value: String(raw("contextThresholdMode", "balanced")), onChange: (v) => setValue("contextThresholdMode", v, "balanced") })] }), _jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsBraveTokenBudget") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [{ value: "auto", label: t("prefsAutoLabel") }, { value: "4000", label: "4K" }, { value: "8000", label: "8K" }, { value: "16000", label: "16K" }, { value: "32000", label: "32K" }], value: typeof draft.contextTokenBudget === "number" ? String(draft.contextTokenBudget) : "auto", onChange: (v) => { if (v === "auto")
                                            setValue("contextTokenBudget", undefined, undefined);
                                        else
                                            setValue("contextTokenBudget", Number(v), undefined); } }), _jsx("span", { style: { fontSize: 11, color: text.tertiary }, children: t("prefsBraveTokenBudgetAutoDesc") })] })] })] }));
        }
        // ---------------------------------------------------------------- You.com
        case "you": {
            const ext = String(raw("extractionMode", "highlights"));
            const desc = ext === "none" ? t("prefsYouSummaryDesc") : t("prefsYouHighlightsDesc");
            return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsYouResultsLabel") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                                    { value: "highlights", label: t("prefsYouHighlights") },
                                    { value: "none", label: t("prefsYouSummary") },
                                ], value: ext, onChange: (v) => setValue("extractionMode", v, "highlights") }), _jsx("div", { className: "dswt-pref-desc", children: _jsx("span", { children: desc }) })] }), _jsxs(AdvancedDelay, { t: t, children: [_jsx(SettingInputRow, { label: t("prefsYouTimeoutSec"), hint: t("prefsYouTimeoutSecDesc"), unit: t("prefsSecondsUnit"), value: typeof draft.fetchCrawlTimeoutSec === "number" ? String(draft.fetchCrawlTimeoutSec) : "", placeholder: "10", onChange: (v) => { const n = Number(v); if (v === "" || Number.isNaN(n))
                                    setValue("fetchCrawlTimeoutSec", undefined, undefined);
                                else
                                    setValue("fetchCrawlTimeoutSec", Math.round(n), undefined); } }), _jsx(SettingInputRow, { label: t("prefsYouFreshnessSec"), hint: t("prefsYouFreshnessSecDesc"), unit: t("prefsSecondsUnit"), value: typeof draft.fetchMaxAgeSec === "number" ? String(draft.fetchMaxAgeSec) : "", placeholder: "0", onChange: (v) => { const n = Number(v); if (v === "" || Number.isNaN(n))
                                    setValue("fetchMaxAgeSec", undefined, undefined);
                                else
                                    setValue("fetchMaxAgeSec", Math.round(n), undefined); } })] })] }));
        }
        // ------------------------------------------------------------ Firecrawl
        case "firecrawl": {
            const onlyMain = raw("fetchOnlyMainContent", true) !== false;
            const maxAge = raw("fetchMaxAgeMs", undefined);
            const cacheKind = maxAge === 0 ? "live" : maxAge === 86400000 ? "day" : maxAge === 604800000 ? "week" : "auto";
            return (_jsxs(_Fragment, { children: [_jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(Switch, { checked: onlyMain, onChange: (v) => setValue("fetchOnlyMainContent", v, true), label: t("prefsFirecrawlOnlyMain") }), _jsxs("span", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("span", { style: { fontSize: 13, color: text.primary }, children: t("prefsFirecrawlOnlyMain") }), _jsx("span", { style: { fontSize: 12, color: text.secondary }, children: t("prefsFirecrawlOnlyMainDesc") })] })] }), _jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsPageCache") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                                    { value: "auto", label: t("prefsFreshnessAuto") },
                                    { value: "live", label: t("prefsFreshnessLive") },
                                    { value: "day", label: t("prefsFirecrawl1Day") },
                                    { value: "week", label: t("prefsFirecrawl7Days") },
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
            const isExperimental = PARALLEL_EXPERIMENTAL_MODES.includes(mode);
            const primaryMode = isExperimental ? "advanced" : mode;
            const expMode = isExperimental ? mode : "off";
            const desc = mode === "basic"
                ? t("prefsParallelBasicDesc")
                : isExperimental
                    ? t("prefsParallelExperimentalDesc")
                    : t("prefsParallelAdvancedDesc");
            const parallelExpItems = [
                { id: "off", label: t("prefsParallelExperimentalOff") },
                ...PARALLEL_EXPERIMENTAL_MODES.map((m) => ({
                    id: m,
                    label: m === "fast" ? t("prefsParallelFast") : t("prefsParallelTurbo"),
                })),
            ];
            const currentExpLabel = expMode === "off"
                ? t("prefsParallelExperimentalOff")
                : expMode === "fast"
                    ? t("prefsParallelFast")
                    : t("prefsParallelTurbo");
            return (_jsxs(_Fragment, { children: [isExperimental && (_jsx("div", { style: { fontSize: 12, color: stateColor.warning, padding: "6px 10px", borderRadius: 8, background: surface.layer2, border: `1px solid ${stateColor.warning}55` }, children: t("prefsParallelExperimentalNote") })), _jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsParallelQualityLabel") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: PARALLEL_PRIMARY_MODES.map((m) => ({ value: m, label: m === "advanced" ? t("prefsParallelAdvanced") : t("prefsParallelBasic") })), value: primaryMode, onChange: (v) => setValue("mode", v, "advanced") }), _jsx("div", { className: "dswt-pref-desc", children: _jsx("span", { children: desc }) })] }), _jsxs(AdvancedDelay, { t: t, children: [_jsx(DropdownSelect, { label: t("prefsParallelExperimental"), valueLabel: currentExpLabel, items: parallelExpItems, onSelect: (id) => setValue("mode", id === "off" ? "advanced" : id, "advanced") }), _jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsParallelCharsLabel") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [{ value: "auto", label: t("prefsAutoLabel") }, { value: "10000", label: t("prefsParallelCharsCompact") }, { value: "25000", label: t("prefsParallelCharsStandard") }, { value: "50000", label: t("prefsParallelCharsMore") }], value: typeof draft.maxCharsTotal === "number" ? String(draft.maxCharsTotal) : "auto", onChange: (v) => { if (v === "auto")
                                            setValue("maxCharsTotal", undefined, undefined);
                                        else
                                            setValue("maxCharsTotal", Number(v), undefined); } })] })] })] }));
        }
        // ------------------------------------------------------------------ Jina
        case "jina": {
            const engine = String(raw("fetchEngine", "auto"));
            const desc = engine === "curl" ? t("prefsJinaModeDirectDesc") : engine === "browser" ? t("prefsJinaModeBrowserDesc") : t("prefsJinaModeAutoDesc");
            const readerLm = raw("fetchReaderLmV2", false) === true;
            const cacheTolerance = raw("fetchCacheToleranceSec", undefined);
            const cacheKind = cacheTolerance === 0 ? "live" : cacheTolerance === 3600 ? "hour" : cacheTolerance === 86400 ? "day" : "auto";
            return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsJinaModeLabel") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                                    { value: "auto", label: t("prefsJinaModeAuto") },
                                    { value: "curl", label: t("prefsJinaModeDirect") },
                                    { value: "browser", label: t("prefsJinaModeBrowser") },
                                ], value: engine, onChange: (v) => setValue("fetchEngine", v, "auto") }), _jsx("div", { className: "dswt-pref-desc", children: _jsx("span", { children: desc }) })] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(Switch, { checked: readerLm, onChange: (v) => setValue("fetchReaderLmV2", v, false), label: t("prefsJinaReaderLmLabel") }), _jsxs("span", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("span", { style: { fontSize: 13, color: text.primary }, children: t("prefsJinaReaderLmLabel") }), _jsx("span", { style: { fontSize: 12, color: text.secondary }, children: t("prefsJinaReaderLmDesc") })] })] }), _jsxs("div", { className: "dswt-pref-field", children: [_jsx(SectionLabel, { children: t("prefsJinaCacheLabel") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                                    { value: "auto", label: t("prefsJinaCacheAuto") },
                                    { value: "live", label: t("prefsJinaCacheLive") },
                                    { value: "hour", label: t("prefsJinaCacheHour") },
                                    { value: "day", label: t("prefsJinaCacheDay") },
                                ], value: cacheKind, onChange: (v) => {
                                    if (v === "auto")
                                        setValue("fetchCacheToleranceSec", undefined, undefined);
                                    else if (v === "live")
                                        setValue("fetchCacheToleranceSec", 0, undefined);
                                    else if (v === "hour")
                                        setValue("fetchCacheToleranceSec", 3600, undefined);
                                    else
                                        setValue("fetchCacheToleranceSec", 86400, undefined);
                                } })] }), _jsxs(AdvancedDelay, { t: t, children: [_jsx(SettingInputRow, { label: t("prefsJinaMaxTokens"), hint: t("prefsJinaMaxTokensDesc"), unit: t("prefsTokensUnit"), value: typeof draft.fetchMaxTokens === "number" ? String(draft.fetchMaxTokens) : "", placeholder: "e.g. 8000", onChange: (v) => { const n = Number(v); if (v === "" || Number.isNaN(n))
                                    setValue("fetchMaxTokens", undefined, undefined);
                                else
                                    setValue("fetchMaxTokens", Math.round(n), undefined); } }), _jsx(SettingInputRow, { label: t("prefsJinaTokenBudget"), hint: t("prefsJinaTokenBudgetDesc"), unit: t("prefsTokensUnit"), value: typeof draft.fetchTokenBudget === "number" ? String(draft.fetchTokenBudget) : "", placeholder: "e.g. 100000", onChange: (v) => { const n = Number(v); if (v === "" || Number.isNaN(n))
                                    setValue("fetchTokenBudget", undefined, undefined);
                                else
                                    setValue("fetchTokenBudget", Math.round(n), undefined); } })] })] }));
        }
        default:
            return null;
    }
}
function SectionLabel(props) {
    return _jsx("span", { className: "dswt-pref-label", children: props.children });
}
function AdvancedDelay(props) {
    const [open, setOpen] = useState(false);
    return (_jsxs("div", { className: "dswt-advanced-disclosure", children: [_jsxs("button", { type: "button", onClick: () => setOpen(!open), className: "dswt-advanced-btn", children: [_jsx("span", { style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", display: "inline-flex" }, children: _jsx(IconChevronRightOutline14, { size: 14 }) }), props.t("advancedParamsTitle")] }), open && (_jsx("div", { className: "dswt-advanced-surface", children: props.children }))] }));
}
