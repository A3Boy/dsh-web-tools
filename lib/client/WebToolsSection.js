import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — Web Search settings page (settings.section, id "web-tools").
 *
 * Information architecture: a one-level Settings page.
 *   - header row: title + enabled switch
 *   - search order summary + edit entry (RoutingModal)
 *   - Providers: one unified list surface (row per provider → ProviderModal)
 *   - Test Search (real run through the Host chain, human-readable timeline)
 *   - Advanced: collapsible low-frequency knobs (timeout)
 *
 * Credentials are NEVER shown as plaintext: the page shows masked hints and
 * manages keys one at a time through Host add/remove endpoints; the Host
 * keeps its existing comma-joined credential string contract.
 * @module
 */
import { useEffect, useRef, useState } from "react";
import { Button, IconChevronRightOutline14, IconEditOutline16, IconSearchOutline16, Input, StateDot, } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "./api.js";
import { text, surface, state as stateColor, button as buttonColor } from "./theme.js";
import { ProviderModal } from "./ProviderModal.js";
import { RoutingModal } from "./RoutingModal.js";
import { providerStatusOf, testOutcomeStatus, quotaSummary, quotaFraction, quotaTier, quotaDisplayKind, quotaRemainingLabel, quotaMetaLine, outcomeLabel, } from "./logic.js";
export { providerStatusOf, quotaSummary, outcomeLabel };
/** Local switch (DSH primitives ship no toggle; role=switch keeps it accessible). */
export function Switch(props) {
    const { checked, onChange, label } = props;
    return (_jsx("button", { type: "button", role: "switch", "aria-checked": checked, "aria-label": label, onClick: () => onChange(!checked), style: {
            position: "relative",
            width: 36,
            height: 20,
            borderRadius: 10,
            border: "1px solid " + (checked ? "transparent" : surface.border),
            background: checked ? buttonColor.primaryFill : surface.layer2,
            cursor: "pointer",
            flex: "none",
            padding: 0,
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
/** One provider card in the providers list (click → ProviderModal).
 *  Cards in the search chain are draggable to reorder; cards outside the
 *  chain render non-draggable with a "not in chain" tag. */
function ProviderCard(props) {
    const { t, p, quota, testResult, orderRank, isDefault, draggable, isDragOver, onClick, onDragStart, onDragOver, onDrop, onDragEnd } = props;
    const inChain = orderRank !== undefined;
    // A connection test can only refine a "ready" guess — it must never flip
    // "not configured" / "not in chain" to auth-error, and a stale failure
    // (key since removed) must not keep a provider red forever.
    const base = providerStatusOf(p, quota, inChain);
    const status = base === "ready" ? (testOutcomeStatus(testResult) ?? base) : base;
    const statusText = {
        ready: t("ready"),
        "rate-limited": t("rateLimited"),
        "auth-error": t("authError"),
        "unreachable": t("unreachable"),
        "not-configured": t("notConfigured"),
        "not-in-chain": t("notInChain"),
    }[status];
    const selfHosted = p.name === "searxng";
    // Gray hollow dot for "not configured" / "not in chain"; colored dots only
    // for real states (green ready / amber rate-limited & unreachable / red auth error).
    const dotState = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
    const statusColor = status === "ready" ? stateColor.success : status === "auth-error" ? stateColor.danger : status === "rate-limited" || status === "unreachable" ? stateColor.warning : text.tertiary;
    return (_jsxs("div", { draggable: draggable, onDragStart: onDragStart, onDragOver: onDragOver, onDrop: onDrop, onDragEnd: onDragEnd, onClick: onClick, className: "wt-provider-row", role: "button", tabIndex: 0, onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
        } }, style: {
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            padding: "12px 14px",
            background: isDragOver ? surface.hover : surface.layer1,
            border: `1px solid ${isDragOver ? "var(--dsw-alias-brand-primary)" : surface.border}`,
            borderRadius: 12,
            cursor: draggable ? "grab" : "pointer",
            fontFamily: "inherit",
            fontSize: 14,
            color: text.primary,
            textAlign: "left",
            boxSizing: "border-box",
        }, onMouseEnter: (e) => { if (!isDragOver)
            e.currentTarget.style.background = surface.hover; }, onMouseLeave: (e) => { if (!isDragOver)
            e.currentTarget.style.background = surface.layer1; }, children: [draggable && (_jsx("span", { "aria-hidden": true, style: { color: text.tertiary, fontSize: 14, cursor: "grab", userSelect: "none", flex: "none" }, children: "\u283F" })), dotState === "hollow" ? (_jsx("span", { "aria-hidden": true, style: {
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    border: `1.5px solid ${text.tertiary}`,
                    flex: "none",
                    boxSizing: "border-box",
                } })) : (_jsx(StateDot, { state: dotState })), _jsx("span", { style: { fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: p.label }), _jsxs("span", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }, className: "wt-provider-meta", children: [_jsx("span", { style: {
                            color: statusColor,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                        }, children: statusText }), selfHosted && (_jsx("span", { style: { color: text.tertiary, fontSize: 12, whiteSpace: "nowrap", border: `1px solid ${surface.border}`, borderRadius: 4, padding: "0 6px" }, children: t("selfHosted") }))] }), quota && quota.supported && (_jsx(ProviderQuotaInline, { t: t, quota: quota })), isDefault && (_jsx("span", { style: { color: accentText(), fontSize: 11, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px", whiteSpace: "nowrap" }, children: t("defaultProviderLabel") })), orderRank !== undefined && !isDefault && (_jsxs("span", { style: { color: text.tertiary, fontSize: 12, whiteSpace: "nowrap" }, children: ["#", orderRank] })), _jsx(IconChevronRightOutline14, { size: 14 })] }));
}
/** Inline quota summary for the provider card: label + bar when computable. */
function ProviderQuotaInline(props) {
    const { t, quota } = props;
    const kind = quotaDisplayKind(quota);
    const fraction = quotaFraction(quota);
    // Unsupported / self-hosted / unlimited: one quiet line, nothing else.
    if (kind === "unavailable") {
        return _jsx("span", { style: { color: text.tertiary, fontSize: 11, whiteSpace: "nowrap" }, children: t("quotaUnavailable") });
    }
    if (kind === "self_hosted") {
        return _jsx("span", { style: { color: text.tertiary, fontSize: 11, whiteSpace: "nowrap" }, children: t("quotaSelfHostedShort") });
    }
    if (kind === "unlimited") {
        return _jsx("span", { style: { color: text.secondary, fontSize: 11, whiteSpace: "nowrap" }, children: t("quotaUnlimited") });
    }
    const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || t("quotaUnavailable");
    const meta = quotaMetaLine(t, quota);
    const tier = quotaTier(fraction);
    const tierColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : accentText();
    return (_jsxs("span", { style: { display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 120, alignItems: "flex-end", textAlign: "right" }, className: "wt-provider-quota", children: [_jsxs("span", { style: { display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }, children: [_jsx("span", { style: { color: text.secondary, fontSize: 12, whiteSpace: "nowrap" }, children: label }), fraction !== undefined && (_jsxs("span", { style: { color: tierColor, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }, children: [Math.round(fraction * 100), "%"] }))] }), fraction !== undefined && (_jsx("span", { style: { width: 140, height: 4, borderRadius: 2, background: surface.layer2, overflow: "hidden", display: "block" }, children: _jsx("span", { style: { width: `${fraction * 100}%`, height: "100%", background: tierColor, display: "block" } }) })), meta && _jsx("span", { style: { color: text.tertiary, fontSize: 10, whiteSpace: "nowrap" }, children: meta })] }));
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
                                void run(); } }) }), _jsx(Button, { variant: "primary", size: "md", onClick: () => void run(), disabled: testing || !query.trim(), children: testing ? t("searching") : t("search") })] }), result && !cleared && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [result.ok ? (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, color: stateColor.success, fontSize: 13 }, children: [_jsx(StateDot, { state: "done", size: 8 }), _jsxs("span", { style: { fontWeight: 600 }, children: [label(result.backend ?? ""), " \u00B7 ", result.latencyMs, "ms \u00B7 ", t("resultCount", { n: result.resultCount ?? 0 })] }), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setCleared(true), children: t("clearResult") }) })] })) : (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, color: stateColor.danger, fontSize: 13 }, children: [_jsx(StateDot, { state: "error", size: 8 }), _jsx("span", { style: { fontWeight: 600 }, children: result.error?.message ?? t("unknownOutcome") }), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setCleared(true), children: t("clearResult") }) })] })), attempts.length > 0 && (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: text.secondary }, children: attempts.map((a, i) => {
                            const ok = a.outcome === "success";
                            const skipped = a.outcome.startsWith("skipped-");
                            return (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsxs("span", { style: { width: 14, color: text.tertiary }, children: [i + 1, "."] }), _jsx("span", { style: { color: text.primary, fontWeight: 500 }, children: label(a.provider) }), _jsx("span", { style: { color: ok ? stateColor.success : skipped ? text.tertiary : stateColor.danger }, children: outcomeLabel(t, a.outcome) }), a.latencyMs !== undefined && _jsxs("span", { style: { color: text.tertiary }, children: [a.latencyMs, "ms"] }), i < attempts.length - 1 && _jsx("span", { style: { marginLeft: "auto", color: text.tertiary }, children: "\u2193" })] }, i));
                        }) })), result.ok && (result.results ?? []).length > 0 && (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: (result.results ?? []).slice(0, 5).map((r, i) => (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2, paddingTop: 6, borderTop: `1px solid ${surface.border}` }, children: [_jsx("a", { href: r.url, target: "_blank", rel: "noreferrer", style: { color: accentText(), textDecoration: "none", fontSize: 13 }, children: r.title }), _jsx("span", { style: { color: text.tertiary, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: r.snippet })] }, i))) }))] }))] }));
}
/** The page. */
export function WebToolsSection(props) {
    const { t } = props;
    const [config, setConfig] = useState(null);
    const [quotas, setQuotas] = useState(null);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [detailFor, setDetailFor] = useState(null);
    const [routingOpen, setRoutingOpen] = useState(false);
    const [providerTestResults, setProviderTestResults] = useState({});
    const [busyProviders, setBusyProviders] = useState({});
    // Main-page drag-to-reorder over the search chain (HTML5 DnD).
    const dragName = useRef(null);
    const [dragOverName, setDragOverName] = useState(null);
    // Optimistic chain order while a drag-save is in flight; cleared once the
    // persisted config reload lands so the server truth takes over.
    const [localProviderOrder, setLocalProviderOrder] = useState(null);
    const loadToken = useRef(0);
    const mounted = useRef(true);
    const load = async () => {
        const token = ++loadToken.current;
        try {
            const cfg = await api.configGet();
            if (token !== loadToken.current)
                return;
            setConfig(cfg);
            setLocalProviderOrder(null); // persisted truth confirmed → drop optimism
            setError("");
        }
        catch (e) {
            if (token === loadToken.current)
                setError(e instanceof Error ? e.message : String(e));
        }
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
        void load();
        void loadQuotas();
        return () => {
            loadToken.current += 1;
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
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    };
    const setEnabled = (enabled) => void save({ enabled });
    const toggleProvider = (name, enabled) => {
        const providerEnabled = Object.fromEntries(config.providers.map((p) => [p.name, p.name === name ? enabled : p.enabled]));
        void save({ providerEnabled });
    };
    const setBaseUrl = (name, baseUrl) => {
        const providerBaseUrls = { ...(config.providers.reduce((a, p) => ({ ...a, [p.name]: p.baseUrl ?? "" }), {})) };
        providerBaseUrls[name] = baseUrl;
        void save({ providerBaseUrls });
    };
    const setAttemptTimeout = (v) => void save({ providerAttemptTimeoutMs: Math.min(60000, Math.max(1000, v)) });
    // One ordered list: [defaultProvider, ...fallbackOrder] — Host schema unchanged.
    const orderedProviders = [
        config.defaultProvider,
        ...config.fallbackOrder.filter((n) => n !== config.defaultProvider),
    ];
    const providerOf = (name) => config.providers.find((p) => p.name === name);
    const enabledNames = new Set(config.providers.filter((p) => p.enabled).map((p) => p.name));
    const saveOrder = (ordered) => {
        const next = ordered.filter((n, i) => ordered.indexOf(n) === i);
        const first = next[0] ?? config.defaultProvider;
        void save({ defaultProvider: first, fallbackOrder: next.slice(1) });
    };
    // Drag-to-reorder on the main page: only chain members are draggable; a
    // drop reorders within the chain (fallbackOrder stays [default, ...rest]).
    const reorderOnDrop = (dragged, over) => {
        if (dragged === over)
            return;
        const next = [...orderedProviders];
        const from = next.indexOf(dragged);
        const to = next.indexOf(over);
        if (from < 0 || to < 0)
            return;
        next.splice(from, 1);
        next.splice(to, 0, dragged);
        // Optimistic local order so cards re-render instantly; the persisted
        // config reload confirms it (or reverts on failure).
        setLocalProviderOrder(next);
        saveOrder(next);
    };
    // Rendering order: chain members first (in search order), then providers
    // outside the chain (registry order). Falls back to the persisted chain
    // while no drag is in flight.
    const renderedProviders = (localProviderOrder ?? orderedProviders)
        .map((name) => providerOf(name))
        .filter((x) => x !== undefined)
        .concat(config.providers.filter((p) => !orderedProviders.includes(p.name)));
    const readyCount = config.providers.filter((p) => {
        if (!p.enabled)
            return false;
        const inChain = orderedProviders.includes(p.name);
        return providerStatusOf(p, quotas?.[p.name], inChain) === "ready";
    }).length;
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
    const detailProvider = detailFor !== null ? providerOf(detailFor) : undefined;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 22, maxWidth: 720, padding: "4px 0 24px" }, children: [_jsx("style", { children: `
        @media (max-width: 640px) {
          .wt-provider-row { flex-wrap: wrap; row-gap: 4px; }
          .wt-provider-meta { flex-basis: 100%; order: 10; padding-left: 22px; }
        }
      ` }), _jsxs("div", { style: { display: "flex", alignItems: "flex-start", gap: 12 }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("h2", { style: { margin: 0, fontSize: 20, fontWeight: 600, lineHeight: "28px", color: text.primary }, children: t("title") }), _jsx("p", { style: { margin: "4px 0 0", fontSize: 14, lineHeight: "22px", color: text.secondary }, children: t("tagline") })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, paddingTop: 2 }, children: [_jsx(Switch, { checked: config.enabled, onChange: setEnabled, label: config.enabled ? t("enabledLabel") : t("disabledLabel") }), saving && _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("saving") }), saved && !saving && _jsx("span", { style: { color: stateColor.success, fontSize: 12 }, children: t("saved") })] })] }), error && _jsx("div", { style: { color: stateColor.danger, fontSize: 13 }, children: error }), config.proxy?.configured === true && config.proxy?.degraded === true && (_jsxs("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${stateColor.warning}`,
                    background: surface.layer1,
                    fontSize: 13,
                    color: text.secondary,
                }, children: [_jsx("strong", { style: { color: stateColor.warning, fontSize: 13 }, children: t("proxyDegradedTitle") }), _jsx("span", { children: t("proxyDegradedBody") })] })), _jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: surface.layer1,
                    border: `1px solid ${surface.border}`,
                    fontSize: 13,
                    color: text.secondary,
                    flexWrap: "wrap",
                }, children: [_jsx("span", { children: t("readySummary", { n: readyCount, total: config.providers.length }) }), _jsx("span", { style: { color: surface.border }, children: "|" }), _jsxs("span", { children: [t("defaultProviderLabel"), ": ", _jsx("strong", { style: { color: text.primary }, children: providerOf(config.defaultProvider)?.label ?? config.defaultProvider })] })] }), _jsxs("section", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 8 }, children: [_jsx("h3", { style: { margin: 0, fontSize: 15, fontWeight: 600, color: text.primary }, children: t("orderLabel") }), _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("orderHint") }), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconEditOutline16, { size: 14 }), onClick: () => setRoutingOpen(true), children: t("editOrder") }) })] }), _jsxs("div", { style: {
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                            padding: "10px 14px",
                            borderRadius: 12,
                            background: surface.layer1,
                            border: `1px solid ${surface.border}`,
                            fontSize: 13,
                        }, children: [orderedProviders.length === 0 && _jsx("span", { style: { color: text.tertiary }, children: t("notConfigured") }), orderedProviders.map((name, i) => {
                                const p = providerOf(name);
                                const ok = p !== undefined && enabledNames.has(name);
                                return (_jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 }, children: [i > 0 && _jsx("span", { style: { color: text.tertiary }, children: "\u2192" }), _jsx("span", { style: { color: ok ? text.primary : text.tertiary, fontWeight: i === 0 ? 600 : 400 }, children: p?.label ?? name }), i === 0 && (_jsx("span", { style: { color: accentText(), fontSize: 11, fontWeight: 600 }, children: t("defaultProviderLabel") }))] }, name));
                            })] })] }), _jsxs("section", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 8 }, children: [_jsx("h3", { style: { margin: 0, fontSize: 15, fontWeight: 600, color: text.primary }, children: t("providersLabel") }), _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("orderHint") }), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconEditOutline16, { size: 14 }), onClick: () => setRoutingOpen(true), children: t("editOrder") }) })] }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: renderedProviders.map((p) => {
                            const inChain = orderedProviders.includes(p.name);
                            const testResult = providerTestResults[p.name];
                            return (_jsx(ProviderCard, { t: t, p: p, quota: quotas?.[p.name], testResult: testResult, orderRank: inChain ? orderedProviders.indexOf(p.name) + 1 : undefined, isDefault: p.name === config.defaultProvider, draggable: inChain, isDragOver: dragOverName === p.name && dragName.current !== null && dragName.current !== p.name, onClick: () => setDetailFor(p.name), onDragStart: (e) => {
                                    dragName.current = p.name;
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", p.name);
                                }, onDragOver: (e) => {
                                    if (!inChain || dragName.current === null)
                                        return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                    if (dragOverName !== p.name)
                                        setDragOverName(p.name);
                                }, onDrop: (e) => {
                                    e.preventDefault();
                                    const dragged = dragName.current;
                                    dragName.current = null;
                                    setDragOverName(null);
                                    if (dragged !== null)
                                        reorderOnDrop(dragged, p.name);
                                }, onDragEnd: () => {
                                    dragName.current = null;
                                    setDragOverName(null);
                                } }, p.name));
                        }) })] }), _jsxs("section", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [_jsx("h3", { style: { margin: 0, fontSize: 15, fontWeight: 600, color: text.primary }, children: t("testSearchTitle") }), _jsx(TestSearchBlock, { t: t, config: config, onError: (msg) => setError(msg) })] }), _jsxs("details", { style: { fontSize: 13 }, children: [_jsx("summary", { style: { cursor: "pointer", color: text.secondary, fontSize: 13, padding: "4px 0" }, children: t("advanced") }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 8, padding: "10px 0 0" }, children: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("label", { style: { color: text.secondary }, children: t("attemptTimeoutLabel") }), _jsx("input", { type: "number", min: 1000, max: 60000, step: 1000, value: config.providerAttemptTimeoutMs, onChange: (e) => setAttemptTimeout(Number(e.target.value)), style: {
                                        width: 90,
                                        padding: "4px 8px",
                                        borderRadius: 6,
                                        border: `1px solid ${surface.border}`,
                                        background: surface.layer2,
                                        color: text.primary,
                                        fontFamily: "inherit",
                                        fontSize: 13,
                                    } }), _jsxs("span", { style: { color: text.tertiary, fontSize: 12 }, children: [t("attemptTimeoutHint"), " (", t("seconds", { n: Math.round(config.providerAttemptTimeoutMs / 1000) }), ")"] })] }) })] }), detailProvider && (_jsx(ProviderModal, { t: t, p: detailProvider, quota: quotas?.[detailProvider.name], testResult: providerTestResults[detailProvider.name], busy: !!busyProviders[detailProvider.name], isDefault: detailProvider.name === config.defaultProvider, inChain: orderedProviders.includes(detailProvider.name), onClose: () => { setDetailFor(null); setProviderTestResults((prev) => { const next = { ...prev }; delete next[detailProvider.name]; return next; }); }, onToggle: (enabled) => toggleProvider(detailProvider.name, enabled), onBaseUrl: (url) => setBaseUrl(detailProvider.name, url), onTest: () => testProvider(detailProvider.name), onRefreshQuota: () => void loadQuotas(true), onConfigChanged: () => {
                    // Credentials changed (add/remove key): drop the stale probe so a
                    // previous "no key" / auth error does not linger after the edit.
                    setProviderTestResults((prev) => { const next = { ...prev }; delete next[detailProvider.name]; return next; });
                    void load();
                } })), routingOpen && (_jsx(RoutingModal, { t: t, providers: config.providers, ordered: orderedProviders, onClose: () => setRoutingOpen(false), onSave: saveOrder }))] }));
}
