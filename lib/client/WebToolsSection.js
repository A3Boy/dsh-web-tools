import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * dsh-web-tools — Web Search settings page (settings.section, id "web-tools").
 *
 * Information architecture: a one-level Settings page.
 *   - header row: title + enabled switch
 *   - search order summary + "编辑" entry (in-place edit mode: drag to reorder,
 *     pick the routing policy, add/remove providers — no separate dialog)
 *   - Providers: one unified list surface (row per provider → ProviderModal)
 *   - More settings: collapsible low-frequency knobs (timeout, test search)
 *
 * Credentials are NEVER shown as plaintext: the page shows masked hints and
 * manages keys one at a time through Host add/remove endpoints; the Host
 * keeps its existing comma-joined credential string contract.
 * @module
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, StateDot, } from "@deepseek-ai/dsh-client-ui-primitives";
import { IconSearchOutline16, IconEditOutline16, IconSettingsOutline16, IconPlusOutline16, } from "./icons.js";
import { api, WebToolsApiError, } from "./api.js";
import { arePlatformStatusesEqual, getPlatformPollIntervalMs } from "./platform-polling.js";
import { applyRoutingResult, createReadSequencer, routingFields } from "./routing-state.js";
import { CURRENT_VERSION } from "../shared/version.js";
import { text, surface, state as stateColor, button as buttonColor } from "./theme.js";
import { ProviderModal } from "./ProviderModal.js";
import { CustomProviderEditor } from "./CustomProviderEditor.js";
import { ExternalLinkIcon, PROVIDER_CAPABILITY_KEY } from "./provider-ui-meta.js";
import { PROVIDER_BRAND } from "./brand.js";
import { providerStatusOf, testOutcomeStatus, quotaSummary, outcomeLabel, translateDict, } from "./logic.js";
import { SettingsGroup, SettingsRow } from "./ui/SettingsGroup.js";
import { QuotaInline } from "./ui/QuotaInline.js";
import { SegmentedControl } from "./ui/SegmentedControl.js";
export { providerStatusOf, quotaSummary, outcomeLabel };
/** Local switch (DSH primitives ship no toggle; role=switch keeps it accessible). */
export function Switch(props) {
    const { checked, onChange, label, disabled } = props;
    return (_jsx("button", { type: "button", role: "switch", "aria-checked": checked, "aria-label": label, disabled: disabled, onClick: () => onChange(!checked), style: {
            position: "relative",
            width: 36,
            height: 20,
            borderRadius: 10,
            border: "1px solid " + (checked ? "transparent" : surface.border),
            background: checked ? buttonColor.primaryFill : surface.layer2,
            cursor: disabled ? "not-allowed" : "pointer",
            flex: "none",
            padding: 0,
            opacity: disabled ? 0.6 : 1,
            transition: "background .15s ease",
        }, children: _jsx("span", { style: {
                position: "absolute",
                top: 2,
                left: checked ? 18 : 2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: checked ? buttonColor.primaryText : text.tertiary,
                transition: "left .15s ease",
            } }) }));
}
/** 6-dot grip icon for drag handle. */
function GripIcon() {
    return (_jsxs("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "currentColor", style: { opacity: 0.35, flexShrink: 0, cursor: "grab" }, children: [_jsx("circle", { cx: "5", cy: "3", r: "1.5" }), _jsx("circle", { cx: "11", cy: "3", r: "1.5" }), _jsx("circle", { cx: "5", cy: "8", r: "1.5" }), _jsx("circle", { cx: "11", cy: "8", r: "1.5" }), _jsx("circle", { cx: "5", cy: "13", r: "1.5" }), _jsx("circle", { cx: "11", cy: "13", r: "1.5" })] }));
}
/** One provider row inside the unified SettingsGroup list. */
function ProviderRow(props) {
    const { t, p, quota, testResult, inOrder, showPreferred, isLast, editMode, isDragging, isOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, onRemove, onAdd, onClick, } = props;
    // Status: "ready" is the quiet default — only anomalies get a label.
    const base = providerStatusOf(p, quota, inOrder);
    const status = base === "ready" ? (testOutcomeStatus(testResult) ?? base) : base;
    const statusText = status === "ready" ? "" : {
        "rate-limited": t("rateLimited"),
        "auth-error": t("authError"),
        "unreachable": t("unreachable"),
        "not-configured": t("notConfigured"),
        "disabled": t("disabled"),
        "not-in-order": t("notInOrder"),
    }[status];
    const dotState = status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "none";
    const statusColor = status === "auth-error" ? stateColor.danger : status === "rate-limited" || status === "unreachable" ? stateColor.warning : text.tertiary;
    const brandIcon = (_jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [editMode && (_jsx("span", { draggable: true, onDragStart: onDragStart, onDragEnd: onDragEnd, title: t("editOrder"), style: { display: "inline-flex", alignItems: "center", padding: "2px 0", cursor: "grab" }, children: _jsx(GripIcon, {}) })), PROVIDER_BRAND[p.name] ? (_jsx("img", { src: PROVIDER_BRAND[p.name].icon, alt: "", width: 22, height: 22, style: { borderRadius: 5, flex: "none" } })) : (_jsx("div", { style: { width: 22, height: 22, borderRadius: 5, background: surface.layer2, border: `1px solid ${surface.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, flex: "none" }, children: "\uD83C\uDF10" }))] }));
    // In edit mode the chain control IS the affordance. Showing the
    // "not in search order" label next to the "add to search order" button is
    // redundant, reads as a second (dead) control, and — because it is a rigid
    // 220px block — used to push the real button out of the card's clipped area.
    // Genuine anomalies (auth/rate-limit/unreachable) keep their label.
    const showStatusText = status !== "ready" && !(editMode === true && status === "not-in-order");
    const trailing = (_jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 12, minWidth: 0 }, children: [editMode === true ? (showStatusText ? (_jsxs("div", { style: { minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }, children: [dotState !== "none" && _jsx(StateDot, { state: dotState, size: 8 }), _jsx("span", { style: { color: statusColor, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: statusText })] })) : null) : status !== "ready" ? (_jsxs("div", { style: { width: 220, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }, children: [dotState !== "none" && _jsx(StateDot, { state: dotState, size: 8 }), _jsx("span", { style: { color: statusColor, fontSize: 12, whiteSpace: "nowrap" }, children: statusText })] })) : (_jsx(QuotaInline, { quota: quota, providerName: p.name, t: t })), editMode && inOrder && (_jsx("button", { type: "button", onClick: (e) => { e.stopPropagation(); onRemove?.(); }, "aria-label": t("removeFromChain"), title: t("removeFromChain"), style: {
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    border: "none",
                    background: stateColor.danger,
                    color: "#fff",
                    cursor: "pointer",
                    padding: 0,
                    flex: "none",
                    transition: "opacity .15s ease",
                    outline: "none",
                }, onMouseEnter: (e) => (e.currentTarget.style.opacity = "0.85"), onMouseLeave: (e) => (e.currentTarget.style.opacity = "1"), children: _jsx("svg", { width: "10", height: "2", viewBox: "0 0 10 2", fill: "currentColor", children: _jsx("rect", { width: "10", height: "2", rx: "0.5" }) }) })), editMode && !inOrder && (_jsx(Button, { size: "sm", variant: "outline", onClick: () => onAdd?.(), style: { padding: "0 8px", height: 24, flex: "none" }, children: t("addToChain") }))] }));
    const titleWithBadge = (_jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { children: p.label }), p.custom && (_jsx("span", { style: {
                    fontSize: 10,
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: surface.layer2,
                    border: `1px solid ${surface.border}`,
                    color: text.secondary,
                    lineHeight: "14px",
                }, children: t("customProviderTag") })), showPreferred && (_jsx("span", { style: {
                    fontSize: 11,
                    fontWeight: 400,
                    color: text.tertiary,
                    lineHeight: "16px",
                }, children: t("preferredProviderLabel") }))] }));
    return (_jsx("div", { onDragOver: onDragOver, onDragLeave: onDragLeave, onDrop: onDrop, style: {
            background: isOver ? surface.hover : isDragging ? surface.layer2 : undefined,
            opacity: isDragging ? 0.4 : 1,
            transition: "background .12s ease",
        }, children: _jsx(SettingsRow, { className: "wt-provider-row", trailingClassName: "wt-provider-meta", icon: brandIcon, title: titleWithBadge, subtitle: p.custom ? (p.description || t("customProviderTag")) : t(PROVIDER_CAPABILITY_KEY[p.name] ?? "capability.search"), trailing: trailing, chevron: !editMode, isLast: isLast, insetDivider: true, onClick: !editMode ? onClick : undefined }) }));
}
function accentText() {
    return "var(--dsw-alias-brand-primary)";
}
/** Test Search block: one input + real run + human-readable timeline. */
function TestSearchBlock(props) {
    const { t, config, onError } = props;
    const [query, setQuery] = useState("DeepSeek Harness");
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState(null);
    const [cleared, setCleared] = useState(false);
    const run = async () => {
        if (!query.trim())
            return;
        setTesting(true);
        setCleared(false);
        try {
            const r = await api.testSearch(query);
            setResult(r);
        }
        catch (e) {
            onError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setTesting(false);
        }
    };
    const attempts = result?.attempts ?? [];
    const label = (name) => config.providers.find((p) => p.name === name)?.label ?? name;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [_jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("div", { style: { flex: 1, minWidth: 0 }, children: _jsx(Input, { value: query, icon: _jsx(IconSearchOutline16, { size: 14 }), onChange: (e) => setQuery(e.target.value), placeholder: t("searchPlaceholder"), onKeyDown: (e) => { if (e.key === "Enter")
                                void run(); } }) }), _jsx(Button, { variant: "primary", size: "md", onClick: () => void run(), disabled: testing || !query.trim(), children: testing ? t("searching") : t("search") })] }), result && !cleared && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [result.ok ? (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, color: stateColor.success, fontSize: 13 }, children: [_jsx(StateDot, { state: "done", size: 8 }), _jsxs("span", { style: { fontWeight: 600 }, children: [t("usingProviderPrefix"), label(result.backend ?? ""), " \u00B7 ", ((result.latencyMs ?? 0) / 1000).toFixed(2), " ", t("secondsUnit"), " \u00B7 ", t("resultCount", { n: result.resultCount ?? 0 })] }), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setCleared(true), children: t("clearResult") }) })] })) : (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, color: stateColor.danger, fontSize: 13 }, children: [_jsx(StateDot, { state: "error", size: 8 }), _jsx("span", { style: { fontWeight: 600 }, children: result.error?.message ?? t("unknownOutcome") }), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setCleared(true), children: t("clearResult") }) })] })), attempts.length > 0 && (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: text.secondary }, children: attempts.map((a, i) => {
                            const ok = a.outcome === "success";
                            const skipped = a.outcome.startsWith("skipped-");
                            return (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsxs("span", { style: { width: 14, color: text.tertiary }, children: [i + 1, "."] }), _jsx("span", { style: { color: text.primary, fontWeight: 500, minWidth: 60 }, children: label(a.provider) }), _jsx("span", { style: { color: ok ? stateColor.success : skipped ? text.tertiary : stateColor.danger, minWidth: 70 }, children: outcomeLabel(t, a.outcome) }), a.latencyMs !== undefined && (_jsxs("span", { style: { color: text.tertiary, marginLeft: "auto" }, children: [(a.latencyMs / 1000).toFixed(1), " ", t("secondsUnit")] }))] }, i));
                        }) })), result.ok && (result.results ?? []).length > 0 && (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: (result.results ?? []).slice(0, 5).map((r, i) => (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2, paddingTop: 6, borderTop: `1px solid ${surface.border}` }, children: [_jsx("a", { href: r.url, target: "_blank", rel: "noreferrer", style: { color: accentText(), textDecoration: "none", fontSize: 13 }, children: r.title }), _jsx("span", { style: { color: text.tertiary, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: r.snippet })] }, i))) }))] }))] }));
}
/** The page. */
export function WebToolsSection(props) {
    const { t: baseT, ui } = props;
    const [config, setConfig] = useState(null);
    const [dshActive, setDshActive] = useState(() => ui?.getActiveLocale() ?? "zh");
    const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
    // Follow DSH-wide locale switches directly — the page always mirrors DSH.
    useEffect(() => {
        if (!ui)
            return;
        return ui.subscribeLocale(() => setDshActive(ui.getActiveLocale()));
    }, [ui]);
    const effectiveLang = dshActive === "en" ? "en" : "zh";
    const t = useMemo(() => {
        if (!ui)
            return baseT;
        const dict = effectiveLang === "en" ? ui.enDict : ui.zhDict;
        const fallback = effectiveLang === "en" ? ui.zhDict : ui.enDict;
        return (key, ...args) => {
            const params = args[0];
            return translateDict(dict, fallback, key, params) ?? baseT(key, ...args);
        };
    }, [ui, effectiveLang, baseT]);
    const [quotas, setQuotas] = useState(null);
    const [versionInfo, setVersionInfo] = useState(null);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [detailFor, setDetailFor] = useState(null);
    const [customEditorOpen, setCustomEditorOpen] = useState(false);
    const [customEditProvider, setCustomEditProvider] = useState(undefined);
    const [editingOrder, setEditingOrder] = useState(false);
    const [providerTestResults, setProviderTestResults] = useState({});
    const [busyProviders, setBusyProviders] = useState({});
    const [timeoutDraftSec, setTimeoutDraftSec] = useState("");
    const dragProvider = useRef(null);
    const [overProvider, setOverProvider] = useState(null);
    const readSeq = useRef(createReadSequencer());
    const mounted = useRef(true);
    /** Mirror of the latest rendered config, for handlers that must not read a stale closure. */
    const configRef = useRef(null);
    configRef.current = config;
    /** Monotonic id of the newest routing edit, so only the last intent settles the view. */
    const orderWriteSeq = useRef(0);
    /** Newest routing intent not yet confirmed by the Host (see saveOrder). */
    const pendingOrder = useRef(null);
    /** Whether a routing write is currently in flight. */
    const orderWriteInFlight = useRef(false);
    /** True while a routing edit is being persisted in the background. */
    const [savingOrder, setSavingOrder] = useState(false);
    useEffect(() => {
        if (config?.providerAttemptTimeoutMs !== undefined) {
            setTimeoutDraftSec(String(Math.round(config.providerAttemptTimeoutMs / 1000)));
        }
    }, [config?.providerAttemptTimeoutMs]);
    const [platformState, setPlatformState] = useState(null);
    const platformStateRef = useRef(null);
    platformStateRef.current = platformState;
    const isFetchingPlatform = useRef(false);
    const loadPlatformStatus = async () => {
        if (isFetchingPlatform.current)
            return;
        isFetchingPlatform.current = true;
        try {
            const p = await api.platformStatus();
            if (mounted.current && !arePlatformStatusesEqual(platformStateRef.current, p)) {
                setPlatformState(p);
            }
        }
        catch {
            // Non-blocking
        }
        finally {
            isFetchingPlatform.current = false;
        }
    };
    const load = async () => {
        const seq = readSeq.current.begin();
        try {
            const cfg = await api.configGet();
            if (!mounted.current)
                return;
            // Apply unless a NEWER read has already landed. Discarding merely because
            // a newer read STARTED silently loses the update and leaves the card
            // stale until it is reopened.
            if (!readSeq.current.accept(seq))
                return;
            // Keep an un-confirmed routing edit on top: the write takes seconds, and
            // a read landing inside that window would otherwise repaint the old order.
            setConfig(pendingOrder.current ? applyRoutingResult(cfg, pendingOrder.current) : cfg);
            setError("");
        }
        catch (e) {
            if (mounted.current && readSeq.current.accept(seq)) {
                setError(e instanceof Error ? e.message : String(e));
            }
        }
        await loadPlatformStatus();
    };
    const loadQuotas = async (force = false) => {
        try {
            const quota = await api.quotaDescribe(force);
            if (!mounted.current)
                return;
            setQuotas(quota.quotas);
        }
        catch {
            // display-only; never disturb the page
        }
    };
    useEffect(() => {
        // Re-arm on every mount: the cleanup below clears this flag, and React
        // StrictMode double-invokes effects (mount → cleanup → mount), which would
        // otherwise leave it permanently false and silently disable platform
        // status + quota updates.
        mounted.current = true;
        void load();
        void loadQuotas();
        void api.versionCheck().then(setVersionInfo).catch(() => { });
        let timer;
        const scheduleNextPoll = () => {
            if (!mounted.current)
                return;
            const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
            const interval = getPlatformPollIntervalMs(isVisible, platformStateRef.current);
            if (interval > 0) {
                timer = setTimeout(async () => {
                    await loadPlatformStatus();
                    scheduleNextPoll();
                }, interval);
            }
        };
        scheduleNextPoll();
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void loadPlatformStatus();
                if (timer)
                    clearTimeout(timer);
                scheduleNextPoll();
            }
            else {
                if (timer)
                    clearTimeout(timer);
            }
        };
        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", onVisibilityChange);
        }
        return () => {
            if (timer)
                clearTimeout(timer);
            if (typeof document !== "undefined") {
                document.removeEventListener("visibilitychange", onVisibilityChange);
            }
            mounted.current = false;
        };
    }, []);
    if (!config) {
        return (_jsx("div", { style: { padding: "12px 0", color: text.tertiary, fontSize: 14 }, children: error ? `${t("webToolsError")}: ${error}` : t("loading") }));
    }
    const save = async (patch) => {
        setSaving(true);
        try {
            await api.configSave(patch);
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    };
    const setEnabled = (enabled) => void save({ enabled });
    // Dedicated Browser Profile Login
    const loginPlatform = async (platform) => {
        try {
            await api.platformLogin(platform);
            await loadPlatformStatus();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };
    const resetPlatformSession = async (platform) => {
        try {
            await api.platformReset(platform);
            await loadPlatformStatus();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };
    const toggleProvider = (name, enabled) => {
        const providerEnabled = Object.fromEntries(config.providers.map((p) => [p.name, p.name === name ? enabled : p.enabled]));
        void save({ providerEnabled });
    };
    const togglePlatform = (name, enabled) => {
        const current = config.platformEnabled ?? { xiaohongshu: true, x: true };
        const platformEnabled = { ...current, [name]: enabled };
        void save({ platformEnabled });
    };
    const setBaseUrl = async (name, baseUrl) => {
        try {
            await api.sourceEndpointSet(name, baseUrl);
            await load();
        }
        catch (err) {
            if (err instanceof WebToolsApiError && err.code === "conflict") {
                if (window.confirm(err.message || t("confirmForeignOverride"))) {
                    try {
                        await api.sourceEndpointSet(name, baseUrl, true);
                        await load();
                    }
                    catch (retryErr) {
                        setError(retryErr instanceof Error ? retryErr.message : String(retryErr));
                    }
                }
            }
            else {
                setError(err instanceof Error ? err.message : String(err));
            }
        }
    };
    const commitTimeoutSec = (secStr) => {
        const num = Number(secStr);
        if (!Number.isFinite(num) || num <= 0) {
            if (config)
                setTimeoutDraftSec(String(Math.round(config.providerAttemptTimeoutMs / 1000)));
            return;
        }
        const ms = Math.min(60000, Math.max(1000, Math.round(num * 1000)));
        setTimeoutDraftSec(String(Math.round(ms / 1000)));
        if (!config || ms !== config.providerAttemptTimeoutMs) {
            void save({ providerAttemptTimeoutMs: ms });
        }
    };
    // One ordered list: [defaultProvider, ...fallbackOrder] — Host schema unchanged.
    const orderedProviders = [
        config.defaultProvider,
        ...config.fallbackOrder.filter((n) => n !== config.defaultProvider),
    ];
    const providerOf = (name) => config.providers.find((p) => p.name === name);
    /**
     * Latest routing order read from the live config, not this render's closure,
     * so rapid successive edits compose instead of overwriting each other.
     */
    const liveOrder = () => {
        const c = configRef.current;
        if (!c)
            return [];
        return [c.defaultProvider, ...c.fallbackOrder.filter((n) => n !== c.defaultProvider)];
    };
    /**
     * Persist a routing edit.
     *
     * The DSH settings write edits the profile patch and recomposes the profile,
     * which measures in SECONDS (routing/set ~2.4-3.9s against config/get
     * ~11-57ms). Two consequences shape this:
     *
     *  - painting only after the response makes the control feel dead, so the new
     *    order is applied locally at once and the write runs behind it, and
     *  - a read completing inside that multi-second window would otherwise
     *    repaint the OLD order and visibly undo the edit, so the un-confirmed
     *    intent is held in `pendingOrder` and re-applied over every read until the
     *    write settles.
     *
     * Writes are drained one at a time; a newer edit replaces the pending intent
     * instead of racing a second multi-second recomposition.
     */
    const saveOrder = (ordered, policy = config.searchRoutingPolicy ?? "ordered") => {
        const fields = routingFields(ordered, policy);
        ++orderWriteSeq.current;
        pendingOrder.current = fields;
        setConfig((prev) => applyRoutingResult(prev, fields));
        setError("");
        setSavingOrder(true);
        drainOrderWrites();
    };
    /** Send the pending routing intent, then drain again if another arrived. */
    const drainOrderWrites = () => {
        if (orderWriteInFlight.current)
            return; // the in-flight settle drains next
        const fields = pendingOrder.current;
        if (!fields) {
            setSavingOrder(false);
            return;
        }
        const seq = orderWriteSeq.current;
        orderWriteInFlight.current = true;
        void api
            .routingSet(fields.policy, [fields.defaultProvider, ...fields.fallbackOrder])
            .then((result) => {
            if (seq !== orderWriteSeq.current)
                return; // a newer intent owns the view
            pendingOrder.current = null;
            setConfig((prev) => applyRoutingResult(prev, result));
            setError("");
        })
            .catch((e) => {
            setError(e instanceof Error ? e.message : String(e));
            if (seq !== orderWriteSeq.current)
                return;
            // Roll the optimistic order back to what the Host actually holds.
            pendingOrder.current = null;
            void load();
        })
            .finally(() => {
            orderWriteInFlight.current = false;
            if (pendingOrder.current)
                drainOrderWrites();
            else
                setSavingOrder(false);
        });
    };
    // Rendering order: providers are listed in the routing order (default +
    // fallback), then providers outside the chain (registry order).
    const renderedProviders = orderedProviders
        .map((name) => providerOf(name))
        .filter((x) => x !== undefined)
        .concat(config.providers.filter((p) => !orderedProviders.includes(p.name)));
    const testProvider = async (provider) => {
        setBusyProviders((b) => ({ ...b, [provider]: true }));
        try {
            const r = await api.testProvider(provider, "OpenAI");
            setProviderTestResults((prev) => ({ ...prev, [provider]: r }));
        }
        catch (e) {
            setProviderTestResults((prev) => ({
                ...prev,
                [provider]: { ok: false, error: { code: "error", message: e instanceof Error ? e.message : String(e) } },
            }));
        }
        finally {
            setBusyProviders((b) => ({ ...b, [provider]: false }));
        }
    };
    // "首选" is only meaningful when the policy is ordered — round-robin and
    // random have no fixed first entry.
    const showPreferredFor = (name) => (config.searchRoutingPolicy ?? "ordered") === "ordered" && name === config.defaultProvider;
    const detailProvider = detailFor !== null ? providerOf(detailFor) : undefined;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 720, padding: "4px 0 24px" }, children: [_jsx("style", { children: `
        .wt-provider-row { flex-wrap: wrap; row-gap: 4px; }
        .wt-provider-meta { flex: 0 1 auto; min-width: 0; }
        @media (max-width: 640px) {
          .wt-provider-meta { flex-basis: 100%; order: 10; padding-left: 22px; }
        }
      ` }), _jsxs("div", { style: { display: "flex", alignItems: "flex-start", gap: 12 }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("h2", { style: { margin: 0, fontSize: 16, fontWeight: 500, lineHeight: "24px", color: text.primary }, children: t("title") }), _jsx("p", { style: { margin: "2px 0 0", fontSize: 14, lineHeight: "22px", color: text.tertiary }, children: t("tagline") })] }), _jsx("div", { style: { display: "flex", alignItems: "center", gap: 8, paddingTop: 2, flex: "none", flexWrap: "wrap", justifyContent: "flex-end" }, children: _jsx(Switch, { checked: config.enabled, onChange: setEnabled, disabled: saving, label: config.enabled ? t("enabledLabel") : t("disabledLabel") }) })] }), error && _jsx("div", { style: { color: stateColor.danger, fontSize: 13 }, children: error }), versionInfo?.updateAvailable && versionInfo.latestVersion && versionInfo.releaseUrl && (_jsxs("div", { className: "dswt-update-banner", role: "status", children: [_jsxs("div", { className: "dswt-update-copy", children: [_jsx("strong", { children: t("updateAvailableTitle", { version: versionInfo.latestVersion }) }), _jsx("span", { children: t("updateAvailableBody", { current: versionInfo.currentVersion }) })] }), _jsxs("a", { className: "dswt-update-link", href: versionInfo.releaseUrl, target: "_blank", rel: "noreferrer", children: [t("viewUpdate"), _jsx(ExternalLinkIcon, { size: 12 })] })] })), config.proxy?.configured === true && config.proxy?.degraded === true && (_jsxs("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${stateColor.warning}`,
                    background: surface.layer1,
                    fontSize: 13,
                    color: text.secondary,
                }, children: [_jsx("strong", { style: { color: stateColor.warning, fontSize: 13 }, children: t("proxyDegradedTitle") }), _jsx("span", { children: t("proxyDegradedBody") })] })), _jsx("section", { children: _jsx(SettingsGroup, { children: _jsx(SettingsRow, { icon: _jsx("div", { style: { display: "inline-flex", alignItems: "center", color: text.secondary }, children: _jsxs("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", children: [_jsx("path", { d: "M2 4h7M13 4h1M2 8h3M9 8h5M2 12h8M14 12h0" }), _jsx("circle", { cx: "11", cy: "4", r: "1.5" }), _jsx("circle", { cx: "7", cy: "8", r: "1.5" }), _jsx("circle", { cx: "12", cy: "12", r: "1.5" })] }) }), title: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { children: t("routingLabel") }), _jsx("span", { style: {
                                        fontSize: 11,
                                        fontWeight: 500,
                                        padding: "2px 7px",
                                        borderRadius: 4,
                                        background: surface.layer2,
                                        color: text.secondary,
                                        border: `1px solid ${surface.border}`,
                                        lineHeight: 1.2,
                                    }, children: t(`routingPolicy.${config.searchRoutingPolicy ?? "ordered"}`) })] }), subtitle: _jsx("span", { children: (() => {
                                const names = orderedProviders.map((name) => providerOf(name)?.label ?? name);
                                const separator = (config.searchRoutingPolicy ?? "ordered") === "random" ? (dshActive === "zh" ? "、" : ", ") : " → ";
                                if (names.length <= 3) {
                                    return names.join(separator);
                                }
                                const head = names.slice(0, 3).join(separator);
                                return `${head} · +${names.length - 3}`;
                            })() }), trailing: _jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 10 }, children: [savingOrder && _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("saving") }), _jsx(Button, { size: "sm", variant: editingOrder ? "primary" : "outline", icon: !editingOrder ? _jsx(IconEditOutline16, { size: 13 }) : undefined, onClick: () => setEditingOrder(!editingOrder), children: editingOrder ? t("done") : t("editOrder") })] }), isLast: true }) }) }), editingOrder && (_jsx("section", { children: _jsx(SettingsGroup, { title: t("routingPolicySection"), children: _jsxs("div", { style: { padding: "10px 14px" }, children: [_jsx(SegmentedControl, { style: { display: "flex", width: "100%" }, options: [
                                    { value: "ordered", label: t("routingPolicy.ordered") },
                                    { value: "round-robin", label: t("routingPolicy.round-robin") },
                                    { value: "random", label: t("routingPolicy.random") },
                                ], value: config.searchRoutingPolicy ?? "ordered", onChange: (v) => saveOrder(liveOrder(), v) }), _jsx("div", { style: { marginTop: 8, fontSize: 12, color: text.tertiary }, children: t(`routingPolicyHint.${config.searchRoutingPolicy ?? "ordered"}`) })] }) }) })), _jsx("section", { children: _jsxs(SettingsGroup, { title: t("platformSourcesTitle"), children: [_jsx(SettingsRow, { icon: _jsx("div", { style: { width: 22, height: 22, borderRadius: 6, background: "#ff2442", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold" }, children: "\u7EA2" }), title: t("xiaohongshuTitle"), subtitle: (config.platformEnabled?.xiaohongshu ?? true) === false
                                ? t("platformDisabled")
                                : platformState?.platforms?.xiaohongshu?.authenticated
                                    ? `${t("platformAccountPrefix")}${platformState.platforms.xiaohongshu.account?.name ?? t("platformConnected")}`
                                    : platformState?.platforms?.xiaohongshu?.sessionEstablished
                                        ? t("platformVerifying")
                                        : t("platformNotLoggedIn"), trailing: _jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 10 }, children: [(config.platformEnabled?.xiaohongshu ?? true) && (platformState?.platforms?.xiaohongshu?.authenticated ? (_jsxs(_Fragment, { children: [_jsx(StateDot, { state: "done", size: 6 }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => void resetPlatformSession("xiaohongshu"), children: t("clearSessionButton") })] })) : platformState?.platforms?.xiaohongshu?.sessionEstablished ? (_jsx(StateDot, { state: "ongoing", size: 6 })) : (_jsx(Button, { size: "sm", variant: "outline", onClick: () => void loginPlatform("xiaohongshu"), children: t("loginButton") }))), _jsx(Switch, { checked: config.platformEnabled?.xiaohongshu ?? true, onChange: (v) => togglePlatform("xiaohongshu", v), label: t("xiaohongshuTitle") })] }) }), _jsx(SettingsRow, { icon: _jsx("div", { style: { width: 22, height: 22, borderRadius: 6, background: "#000", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold" }, children: "\uD835\uDD4F" }), title: t("xTitle"), subtitle: (config.platformEnabled?.x ?? true) === false
                                ? t("platformDisabled")
                                : platformState?.platforms?.x?.authenticated
                                    ? `${t("platformAccountPrefix")}${platformState.platforms.x.account?.handle ?? t("platformConnected")}`
                                    : platformState?.platforms?.x?.sessionEstablished
                                        ? t("platformVerifying")
                                        : t("platformNotLoggedIn"), trailing: _jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 10 }, children: [(config.platformEnabled?.x ?? true) && (platformState?.platforms?.x?.authenticated ? (_jsxs(_Fragment, { children: [_jsx(StateDot, { state: "done", size: 6 }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => void resetPlatformSession("x"), children: t("clearSessionButton") })] })) : platformState?.platforms?.x?.sessionEstablished ? (_jsx(StateDot, { state: "ongoing", size: 6 })) : (_jsx(Button, { size: "sm", variant: "outline", onClick: () => void loginPlatform("x"), children: t("loginButton") }))), _jsx(Switch, { checked: config.platformEnabled?.x ?? true, onChange: (v) => togglePlatform("x", v), label: t("xTitle") })] }), isLast: true })] }) }), _jsx("section", { children: _jsx(SettingsGroup, { title: t("providersLabel"), action: _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconPlusOutline16, { size: 13 }), onClick: () => {
                            setCustomEditProvider(undefined);
                            setCustomEditorOpen(true);
                        }, children: t("addCustomProvider") }), dividers: "inset", children: renderedProviders.map((p, idx) => {
                        const testResult = providerTestResults[p.name];
                        const isDragging = editingOrder && dragProvider.current === p.name;
                        const isOver = editingOrder && overProvider === p.name && dragProvider.current !== null && dragProvider.current !== p.name;
                        return (_jsx(ProviderRow, { t: t, p: p, quota: quotas?.[p.name], testResult: testResult, inOrder: orderedProviders.includes(p.name), showPreferred: showPreferredFor(p.name), isLast: idx === renderedProviders.length - 1, editMode: editingOrder, isDragging: isDragging, isOver: isOver, onDragStart: (e) => {
                                dragProvider.current = p.name;
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", p.name);
                            }, onDragOver: (e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                if (overProvider !== p.name)
                                    setOverProvider(p.name);
                            }, onDragLeave: () => {
                                if (overProvider === p.name)
                                    setOverProvider(null);
                            }, onDrop: (e) => {
                                e.preventDefault();
                                const fromName = dragProvider.current;
                                dragProvider.current = null;
                                setOverProvider(null);
                                if (!fromName || fromName === p.name)
                                    return;
                                // Compute next order from the LIVE order so rapid edits compose
                                const currentOrderList = [...liveOrder()];
                                const fromIdx = currentOrderList.indexOf(fromName);
                                const toIdx = currentOrderList.indexOf(p.name);
                                if (fromIdx !== -1 && toIdx !== -1) {
                                    currentOrderList.splice(fromIdx, 1);
                                    currentOrderList.splice(toIdx, 0, fromName);
                                    saveOrder(currentOrderList);
                                }
                                else if (fromIdx === -1 && toIdx !== -1) {
                                    currentOrderList.splice(toIdx, 0, fromName);
                                    saveOrder(currentOrderList);
                                }
                            }, onDragEnd: () => {
                                dragProvider.current = null;
                                setOverProvider(null);
                            }, onRemove: () => {
                                const next = liveOrder().filter((n) => n !== p.name);
                                if (next.length > 0)
                                    saveOrder(next);
                            }, onAdd: () => {
                                const current = liveOrder();
                                if (!current.includes(p.name))
                                    saveOrder([...current, p.name]);
                            }, onClick: () => {
                                if (p.custom) {
                                    setCustomEditProvider(p);
                                }
                                else {
                                    setDetailFor(p.name);
                                }
                            } }, p.name));
                    }) }) }), _jsxs("section", { style: { marginTop: 4 }, children: [_jsx(SettingsGroup, { children: _jsx(SettingsRow, { icon: _jsx("div", { style: { display: "inline-flex", alignItems: "center", color: text.secondary }, children: _jsx(IconSettingsOutline16, { size: 16 }) }), title: t("diagnosticsAndMore"), chevron: true, isLast: true, onClick: () => setDiagnosticsOpen(!diagnosticsOpen) }) }), diagnosticsOpen && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 16, marginTop: 8, padding: "14px", borderRadius: 12, background: surface.layer1, border: `1px solid ${surface.border}` }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [_jsx("span", { style: { fontSize: 13, fontWeight: 500, color: text.primary }, children: t("attemptTimeoutLabel") }), _jsx("span", { style: { fontSize: 12, color: text.tertiary }, children: t("attemptTimeoutHint") })] }), _jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [_jsx("input", { type: "number", min: 1, max: 60, step: 1, value: timeoutDraftSec, onChange: (e) => setTimeoutDraftSec(e.target.value), onBlur: () => commitTimeoutSec(timeoutDraftSec), onKeyDown: (e) => {
                                                    if (e.key === "Enter") {
                                                        e.currentTarget.blur();
                                                    }
                                                }, style: {
                                                    width: 54,
                                                    padding: "4px 8px",
                                                    borderRadius: 6,
                                                    border: `1px solid ${surface.border}`,
                                                    background: surface.layer2,
                                                    color: text.primary,
                                                    fontFamily: "inherit",
                                                    fontSize: 13,
                                                    textAlign: "center",
                                                } }), _jsx("span", { style: { color: text.secondary, fontSize: 13 }, children: t("secondsUnit") })] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8, paddingTop: 10, borderTop: `1px solid ${surface.border}` }, children: [_jsx("span", { style: { fontSize: 13, fontWeight: 500, color: text.primary }, children: t("testSearchTitle") }), _jsx(TestSearchBlock, { t: t, config: config, onError: (msg) => setError(msg) })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2, paddingTop: 10, borderTop: `1px solid ${surface.border}` }, children: [_jsxs("span", { style: { fontSize: 13, color: text.primary }, children: [t("clientBundleLabel"), ": ", _jsxs("code", { style: { fontFamily: "ui-monospace, monospace" }, children: ["v", CURRENT_VERSION] })] }), _jsx("span", { style: { fontSize: 12, color: text.tertiary }, children: t("clientBundleHint") })] })] }))] }), detailProvider && (_jsx(ProviderModal, { t: t, p: detailProvider, quota: quotas?.[detailProvider.name], testResult: providerTestResults[detailProvider.name], busy: !!busyProviders[detailProvider.name], showPreferred: showPreferredFor(detailProvider.name), inChain: orderedProviders.includes(detailProvider.name), onClose: () => { setDetailFor(null); setProviderTestResults((prev) => { const next = { ...prev }; delete next[detailProvider.name]; return next; }); }, onToggle: (enabled) => toggleProvider(detailProvider.name, enabled), onBaseUrl: (url) => setBaseUrl(detailProvider.name, url), onTest: () => testProvider(detailProvider.name), onRefreshQuota: () => void loadQuotas(true), onConfigChanged: async () => {
                    // Credentials or preferences changed: drop the stale probe so a
                    // previous "no key" / auth error does not linger after the edit.
                    setProviderTestResults((prev) => { const next = { ...prev }; delete next[detailProvider.name]; return next; });
                    await load();
                } })), (customEditorOpen || customEditProvider) && (_jsx(CustomProviderEditor, { open: true, onClose: () => {
                    setCustomEditorOpen(false);
                    setCustomEditProvider(undefined);
                }, provider: customEditProvider, onSaved: async (sourceId, addToOrder) => {
                    await load();
                    if (addToOrder) {
                        const currentOrder = liveOrder();
                        if (!currentOrder.includes(sourceId)) {
                            await saveOrder([...currentOrder, sourceId]);
                        }
                    }
                }, onDeleted: async () => {
                    await load();
                }, t: t }))] }));
}
