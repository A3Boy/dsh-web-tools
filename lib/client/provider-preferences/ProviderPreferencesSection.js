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
import { Button, IconChevronRightOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "../api.js";
import { text, surface, state as stateColor } from "../theme.js";
import { ChoiceCard } from "./ChoiceCard.js";
import { formatProviderOptionsSummary } from "../logic.js";
import { Switch } from "../WebToolsSection.js";
import { SegmentedControl } from "../ui/SegmentedControl.js";
import { tavilyChunksVisible, PARALLEL_PRIMARY_MODES, PARALLEL_EXPERIMENTAL_MODES, EXA_SEARCH_TYPE_OPTIONS, exaPrimaryMode, exaPrimaryApplyable } from "./contracts.js";
/** Collapsed pill: 已调整 (neutral) / 未保存 (warning). Default state returns null (§30). */
function Pill(props) {
    if (props.kind === "none" || props.kind === "default")
        return null;
    const isUnsaved = props.kind === "unsaved";
    const color = isUnsaved ? stateColor.warning : text.tertiary;
    const bg = surface.layer2;
    const label = isUnsaved ? props.t("prefsUnsaved") : props.t("prefsAdjusted");
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
        }, children: label }));
}
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
    const { t, p, onConfigChanged } = props;
    if (p.name === "searxng" || !p.options)
        return null;
    return _jsx(PreferencesBody, { t: t, p: p, onConfigChanged: onConfigChanged }, p.name);
}
function PreferencesBody(props) {
    const { t, p, onConfigChanged } = props;
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
            setMsg({ text: t("prefsSaved"), tone: "success" });
            window.setTimeout(() => setMsg(null), 2000);
        }
        catch {
            setMsg({ text: t("prefsSaveFailed"), tone: "error" });
        }
        finally {
            setSaving(false);
        }
    };
    const handleCancel = () => { setDraft({ ...savedOverrides }); setMsg(null); };
    // Transactional restore: "恢复默认" only clears the DRAFT — nothing is
    // written to the Host until the user presses 保存. This keeps the restore
    // and the regular edit on the same interaction model (draft → save) and
    // makes the action undoable by pressing 取消.
    const handleResetToDefaults = () => {
        setDraft({});
        setMsg(null);
    };
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }, children: [_jsx(ProviderControls, { t: t, provider: p.name, draft: draft, setValue: setValue, eff: eff }), dirty && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 2, paddingTop: 10, borderTop: `1px solid ${surface.border}` }, children: [_jsx("span", { style: { fontSize: 12, color: text.secondary }, children: t("prefsModified", { n: dirtyKeys.length }) }), _jsxs("span", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }, children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: handleCancel, disabled: saving, children: t("prefsCancel") }), _jsx(Button, { size: "sm", variant: "primary", onClick: handleSave, disabled: saving, children: saving ? t("prefsSaving") : t("prefsSave") })] })] })), !dirty && !isDef && (_jsx("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: 2 }, children: _jsx(Button, { size: "sm", variant: "ghost", onClick: handleResetToDefaults, disabled: saving, children: t("prefsRestore") }) })), msg && _jsx("div", { style: { fontSize: 12, color: msg.tone === "error" ? stateColor.danger : stateColor.success, textAlign: "right" }, children: msg.text })] }));
}
/** Per-provider control panels — fully i18n, Segmented single-choice with active description & subtle default hint. */
function ProviderControls(props) {
    const { t, provider, draft, setValue } = props;
    const raw = (key, fallback) => draft[key] ?? fallback;
    switch (provider) {
        // ------------------------------------------------------------------ Exa
        case "exa": {
            const mode = String(raw("searchType", "auto"));
            const isCustomMode = mode !== "auto";
            const desc = mode === "fast" ? t("prefsExaFastDesc") : mode === "instant" ? t("prefsFastDesc") : mode.startsWith("deep") ? t("prefsExaDeepDesc") : t("prefsExaAutoDesc");
            const maxAgeHours = raw("maxAgeHours", undefined);
            const freshness = maxAgeHours === 0 ? "live" : maxAgeHours === -1 ? "cache" : "auto";
            // Lossless primary: "深入" only writes when the current mode is NOT
            // already a precise deep variant (deep-lite / deep / deep-reasoning).
            const handlePrimaryMode = (v) => {
                if (!exaPrimaryApplyable(v, mode))
                    return;
                setValue("searchType", v, "auto");
            };
            const primaryValue = exaPrimaryMode(mode);
            return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsExaModeLabel") }), _jsx(SegmentedControl, { options: [
                                    { value: "auto", label: t("prefsExaAuto") },
                                    { value: "fast", label: t("prefsFast") },
                                    { value: "deep", label: t("prefsDeep") },
                                ], value: primaryValue, onChange: handlePrimaryMode }), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }, children: [_jsx("span", { children: desc }), isCustomMode && _jsx("span", { style: { color: text.tertiary }, children: t("prefsDefaultValueHint", { v: t("prefsExaAuto") }) })] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsExaFreshnessLabel") }), _jsx(SegmentedControl, { options: [
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
                                } }), _jsxs(AdvancedDelay, { t: t, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsExaNativeLabel") }), _jsx(SegmentedControl, { style: { width: "100%", display: "flex" }, options: EXA_SEARCH_TYPE_OPTIONS.map((m) => {
                                                    const keyHint = {
                                                        auto: "Auto",
                                                        fast: "Fast",
                                                        instant: "Instant",
                                                        "deep-lite": "DeepLite",
                                                        deep: "Deep",
                                                        "deep-reasoning": "DeepReasoning",
                                                    };
                                                    return { value: m, label: t(`prefsExaNative${keyHint[m]}`) };
                                                }), value: mode, onChange: (v) => setValue("searchType", v, "auto") })] }), _jsx(NumberField, { label: t("prefsExaFreshnessLabel") + " (h)", hint: t("prefsExaMaxAgeHint"), value: typeof draft.maxAgeHours === "number" ? String(draft.maxAgeHours) : "", onChange: (v) => {
                                            const n = Number(v);
                                            if (v === "" || Number.isNaN(n))
                                                setValue("maxAgeHours", undefined, undefined);
                                            else
                                                setValue("maxAgeHours", Math.round(n), undefined);
                                        } })] })] })] }));
        }
        // --------------------------------------------------------------- Tavily
        case "tavily": {
            const autoParams = raw("autoParameters", false) === true;
            const depth = String(raw("searchDepth", "basic"));
            const isCustomDepth = depth !== "basic";
            const desc = depth === "advanced" ? t("prefsTavilyAdvancedDesc") : depth === "fast" ? t("prefsTavilyFastDesc") : depth === "ultra-fast" ? t("prefsTavilyUltraFastDesc") : t("prefsTavilyBasicDesc");
            return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsTavilyDepthLabel") }), _jsx(SegmentedControl, { disabled: autoParams, options: [
                                    { value: "basic", label: t("prefsTavilyBasic") },
                                    { value: "advanced", label: t("prefsTavilyAdvanced") },
                                    { value: "fast", label: t("prefsTavilyFast") },
                                    { value: "ultra-fast", label: t("prefsTavilyUltraFast") },
                                ], value: depth, onChange: (v) => setValue("searchDepth", v, "basic") }), !autoParams && (_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }, children: [_jsx("span", { children: desc }), isCustomDepth && _jsx("span", { style: { color: text.tertiary }, children: t("prefsDefaultValueHint", { v: t("prefsTavilyBasic") }) })] }))] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(Switch, { checked: autoParams, onChange: (v) => setValue("autoParameters", v, false), label: t("prefsTavilyAutoParams") }), _jsxs("span", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("span", { style: { fontSize: 13, color: text.primary }, children: t("prefsTavilyAutoParams") }), _jsx("span", { style: { fontSize: 12, color: text.secondary }, children: t("prefsTavilyAutoParamsDesc") })] })] }), _jsxs(AdvancedDelay, { t: t, children: [tavilyChunksVisible(depth, autoParams) && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsTavilyChunksPerSource") }), _jsx(SegmentedControl, { options: [{ value: "auto", label: t("prefsAutoLabel") }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }], value: typeof draft.chunksPerSource === "number" ? String(draft.chunksPerSource) : "auto", onChange: (v) => { if (v === "auto")
                                            setValue("chunksPerSource", undefined, undefined);
                                        else
                                            setValue("chunksPerSource", Number(v), undefined); } })] })), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsTavilyExtractDepth") }), _jsx(SegmentedControl, { options: [{ value: "basic", label: t("prefsExtractBasic") }, { value: "advanced", label: t("prefsExtractAdvanced") }], value: String(raw("fetchExtractDepth", "basic")), onChange: (v) => setValue("fetchExtractDepth", v, "basic") })] })] })] }));
        }
        // ---------------------------------------------------------------- Brave
        case "brave": {
            const pref = String(raw("endpointPreference", "auto"));
            const isCustomPref = pref !== "auto";
            const desc = pref === "llm-context" ? t("prefsBraveLlmContextDesc") : pref === "web-search" ? t("prefsBraveWebSearchDesc") : t("prefsBraveAutoDesc");
            return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsBraveModeLabel") }), _jsx(SegmentedControl, { options: [
                                    { value: "auto", label: t("prefsBraveAuto") },
                                    { value: "llm-context", label: t("prefsBraveLlmContext") },
                                    { value: "web-search", label: t("prefsBraveWebSearch") },
                                ], value: pref, onChange: (v) => setValue("endpointPreference", v, "auto") }), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }, children: [_jsx("span", { children: desc }), isCustomPref && _jsx("span", { style: { color: text.tertiary }, children: t("prefsDefaultValueHint", { v: t("prefsBraveAuto") }) })] })] }), _jsxs(AdvancedDelay, { t: t, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsBraveThreshold") }), _jsx(SegmentedControl, { options: [
                                            { value: "balanced", label: t("prefsBraveThresholdBalanced") },
                                            { value: "strict", label: t("prefsBraveThresholdStrict") },
                                            { value: "lenient", label: t("prefsBraveThresholdLenient") },
                                            { value: "disabled", label: t("prefsBraveThresholdOff") },
                                        ], value: String(raw("contextThresholdMode", "balanced")), onChange: (v) => setValue("contextThresholdMode", v, "balanced") })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsBraveTokenBudget") }), _jsx(SegmentedControl, { options: [{ value: "auto", label: t("prefsAutoLabel") }, { value: "4000", label: "4K" }, { value: "8000", label: "8K" }, { value: "16000", label: "16K" }, { value: "32000", label: "32K" }], value: typeof draft.contextTokenBudget === "number" ? String(draft.contextTokenBudget) : "auto", onChange: (v) => { if (v === "auto")
                                            setValue("contextTokenBudget", undefined, undefined);
                                        else
                                            setValue("contextTokenBudget", Number(v), undefined); } })] })] })] }));
        }
        // ---------------------------------------------------------------- You.com
        case "you": {
            const ext = String(raw("extractionMode", "highlights"));
            const isCustomExt = ext !== "highlights";
            const desc = ext === "none" ? t("prefsYouSummaryDesc") : t("prefsYouHighlightsDesc");
            return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsYouResultsLabel") }), _jsx(SegmentedControl, { options: [
                                    { value: "highlights", label: t("prefsYouHighlights") },
                                    { value: "none", label: t("prefsYouSummary") },
                                ], value: ext, onChange: (v) => setValue("extractionMode", v, "highlights") }), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }, children: [_jsx("span", { children: desc }), isCustomExt && _jsx("span", { style: { color: text.tertiary }, children: t("prefsDefaultValueHint", { v: t("prefsYouHighlights") }) })] })] }), _jsx(AdvancedDelay, { t: t, children: _jsxs("div", { style: { display: "flex", gap: 14, flexWrap: "wrap" }, children: [_jsx(NumberField, { label: t("prefsYouTimeoutSec"), value: typeof draft.fetchCrawlTimeoutSec === "number" ? String(draft.fetchCrawlTimeoutSec) : "", onChange: (v) => { const n = Number(v); if (v === "" || Number.isNaN(n))
                                        setValue("fetchCrawlTimeoutSec", undefined, undefined);
                                    else
                                        setValue("fetchCrawlTimeoutSec", Math.round(n), undefined); } }), _jsx(NumberField, { label: t("prefsYouFreshnessSec"), value: typeof draft.fetchMaxAgeSec === "number" ? String(draft.fetchMaxAgeSec) : "", onChange: (v) => { const n = Number(v); if (v === "" || Number.isNaN(n))
                                        setValue("fetchMaxAgeSec", undefined, undefined);
                                    else
                                        setValue("fetchMaxAgeSec", Math.round(n), undefined); } })] }) })] }));
        }
        // ------------------------------------------------------------ Firecrawl
        case "firecrawl": {
            const onlyMain = raw("fetchOnlyMainContent", true) !== false;
            const maxAge = raw("fetchMaxAgeMs", undefined);
            const cacheKind = maxAge === 0 ? "live" : maxAge === 86400000 ? "day" : maxAge === 604800000 ? "week" : "auto";
            return (_jsxs(_Fragment, { children: [_jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(Switch, { checked: onlyMain, onChange: (v) => setValue("fetchOnlyMainContent", v, true), label: t("prefsFirecrawlOnlyMain") }), _jsxs("span", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("span", { style: { fontSize: 13, color: text.primary }, children: t("prefsFirecrawlOnlyMain") }), _jsx("span", { style: { fontSize: 12, color: text.secondary }, children: t("prefsFirecrawlOnlyMainDesc") })] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsPageCache") }), _jsx(SegmentedControl, { options: [
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
            return (_jsxs(_Fragment, { children: [isExperimental && (_jsx("div", { style: { fontSize: 12, color: stateColor.warning, padding: "6px 10px", borderRadius: 8, background: surface.layer2, border: `1px solid ${stateColor.warning}55` }, children: t("prefsParallelExperimentalNote") })), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsParallelQualityLabel") }), _jsx(SegmentedControl, { options: PARALLEL_PRIMARY_MODES.map((m) => ({ value: m, label: m === "advanced" ? t("prefsParallelAdvanced") : t("prefsParallelBasic") })), value: primaryMode, onChange: (v) => setValue("mode", v, "advanced") }), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }, children: [_jsx("span", { children: desc }), mode !== "advanced" && _jsx("span", { style: { color: text.tertiary }, children: t("prefsDefaultValueHint", { v: t("prefsParallelAdvanced") }) })] })] }), _jsxs(AdvancedDelay, { t: t, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsParallelExperimental") }), _jsx(SegmentedControl, { options: [
                                            { value: "off", label: t("prefsParallelExperimentalOff") },
                                            ...PARALLEL_EXPERIMENTAL_MODES.map((m) => ({ value: m, label: m === "fast" ? t("prefsParallelFast") : t("prefsParallelTurbo") })),
                                        ], value: expMode, onChange: (v) => setValue("mode", v === "off" ? "advanced" : v, "advanced") })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsParallelCharsLabel") }), _jsx(SegmentedControl, { options: [{ value: "auto", label: t("prefsAutoLabel") }, { value: "10000", label: t("prefsParallelCharsCompact") }, { value: "25000", label: t("prefsParallelCharsStandard") }, { value: "50000", label: t("prefsParallelCharsMore") }], value: typeof draft.maxCharsTotal === "number" ? String(draft.maxCharsTotal) : "auto", onChange: (v) => { if (v === "auto")
                                            setValue("maxCharsTotal", undefined, undefined);
                                        else
                                            setValue("maxCharsTotal", Number(v), undefined); } })] })] })] }));
        }
        // ------------------------------------------------------------------ Jina
        case "jina": {
            const engine = String(raw("fetchEngine", "auto"));
            const isCustomEngine = engine !== "auto";
            const desc = engine === "curl" ? t("prefsJinaModeDirectDesc") : engine === "browser" ? t("prefsJinaModeBrowserDesc") : t("prefsJinaModeAutoDesc");
            const readerLm = raw("fetchReaderLmV2", false) === true;
            const cacheTolerance = raw("fetchCacheToleranceSec", undefined);
            const cacheKind = cacheTolerance === 0 ? "live" : cacheTolerance === 3600 ? "hour" : cacheTolerance === 86400 ? "day" : "auto";
            return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsJinaModeLabel") }), _jsx(SegmentedControl, { options: [
                                    { value: "auto", label: t("prefsJinaModeAuto") },
                                    { value: "curl", label: t("prefsJinaModeDirect") },
                                    { value: "browser", label: t("prefsJinaModeBrowser") },
                                ], value: engine, onChange: (v) => setValue("fetchEngine", v, "auto") }), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }, children: [_jsx("span", { children: desc }), isCustomEngine && _jsx("span", { style: { color: text.tertiary }, children: t("prefsDefaultValueHint", { v: t("prefsJinaModeAuto") }) })] })] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(Switch, { checked: readerLm, onChange: (v) => setValue("fetchReaderLmV2", v, false), label: t("prefsJinaReaderLmLabel") }), _jsxs("span", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("span", { style: { fontSize: 13, color: text.primary }, children: t("prefsJinaReaderLmLabel") }), _jsx("span", { style: { fontSize: 12, color: text.secondary }, children: t("prefsJinaReaderLmDesc") })] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(SectionLabel, { children: t("prefsJinaCacheLabel") }), _jsx(SegmentedControl, { options: [
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
                                } })] }), _jsxs(AdvancedDelay, { t: t, children: [_jsx(NumberField, { label: t("prefsJinaMaxTokens"), hint: t("prefsJinaMaxTokensDesc"), value: typeof draft.fetchMaxTokens === "number" ? String(draft.fetchMaxTokens) : "", onChange: (v) => { const n = Number(v); if (v === "" || Number.isNaN(n))
                                    setValue("fetchMaxTokens", undefined, undefined);
                                else
                                    setValue("fetchMaxTokens", Math.round(n), undefined); } }), _jsx(NumberField, { label: t("prefsJinaTokenBudget"), hint: t("prefsJinaTokenBudgetDesc"), value: typeof draft.fetchTokenBudget === "number" ? String(draft.fetchTokenBudget) : "", onChange: (v) => { const n = Number(v); if (v === "" || Number.isNaN(n))
                                    setValue("fetchTokenBudget", undefined, undefined);
                                else
                                    setValue("fetchTokenBudget", Math.round(n), undefined); } })] })] }));
        }
        default:
            return null;
    }
}
function SectionLabel(props) {
    return _jsx("span", { style: { fontSize: 12, fontWeight: 600, color: text.secondary }, children: props.children });
}
function AdvancedDelay(props) {
    const [open, setOpen] = useState(false);
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [_jsxs("button", { type: "button", onClick: () => setOpen(!open), style: { alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 0", fontSize: 12, border: "none", background: "transparent", color: text.secondary, cursor: "pointer", fontFamily: "inherit" }, children: [_jsx("span", { style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", display: "inline-flex" }, children: _jsx(IconChevronRightOutline14, { size: 12 }) }), props.t("moreSettings")] }), open && _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: 8, borderRadius: 8, background: surface.layer1 }, children: props.children })] }));
}
