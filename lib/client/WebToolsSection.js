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
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, IconChevronRightOutline14, IconEditOutline16, IconSearchOutline16, Input, StateDot, } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "./api.js";
import { text, surface, state as stateColor, button as buttonColor } from "./theme.js";
import { ProviderModal } from "./ProviderModal.js";
import { RoutingModal } from "./RoutingModal.js";
import { PROVIDER_BRAND } from "./brand.js";
import { providerStatusOf, testOutcomeStatus, quotaSummary, quotaFraction, quotaTier, outcomeLabel, resolveUiLanguage, translateDict, } from "./logic.js";
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
/** One compact quota + status display in the provider row.
 *  Normal: silent (no green dots or 'ready' text); displays honest quota summary + micro progress bar when available.
 *  Abnormal / Non-ready: displays status dot + issue text. */
function ProviderRowRight(props) {
    const { t, status, statusText, dotState, statusColor, quota } = props;
    // Abnormal / disabled / unconfigured states speak up with status dot & text.
    if (status !== "ready") {
        return (_jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }, children: [dotState === "hollow" ? (_jsx("span", { "aria-hidden": true, style: { width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${text.tertiary}`, flex: "none", boxSizing: "border-box" } })) : (_jsx(StateDot, { state: dotState, size: 8 })), _jsx("span", { style: { color: statusColor, fontSize: 12, whiteSpace: "nowrap" }, children: statusText })] }));
    }
    // Ready / healthy state: stay quiet, show quota if available.
    const summary = quotaSummary(t, quota);
    const fraction = quotaFraction(quota);
    const tier = quotaTier(fraction);
    const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : text.tertiary;
    if (!summary && fraction === undefined) {
        return null;
    }
    return (_jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }, children: [summary && (_jsx("span", { style: { color: text.secondary, fontSize: 12, whiteSpace: "nowrap" }, children: summary })), fraction !== undefined && (_jsx("div", { style: { width: 64, height: 3, borderRadius: 2, background: surface.layer2, overflow: "hidden", flex: "none" }, children: _jsx("div", { style: { width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .2s ease" } }) }))] }));
}
/** One provider row inside the unified ProviderGroup list. */
function ProviderRow(props) {
    const { t, p, quota, testResult, inOrder, showPreferred, isLast, onClick } = props;
    const base = providerStatusOf(p, quota, inOrder);
    const status = base === "ready" ? (testOutcomeStatus(testResult) ?? base) : base;
    const statusText = {
        ready: t("ready"),
        "rate-limited": t("rateLimited"),
        "auth-error": t("authError"),
        "unreachable": t("unreachable"),
        "not-configured": t("notConfigured"),
        "disabled": t("disabled"),
        "not-in-order": t("notInOrder"),
    }[status];
    const dotState = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
    const statusColor = status === "ready" ? stateColor.success : status === "auth-error" ? stateColor.danger : status === "rate-limited" || status === "unreachable" ? stateColor.warning : text.tertiary;
    return (_jsxs("div", { onClick: onClick, role: "button", tabIndex: 0, onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
        } }, style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "10px 14px",
            background: "transparent",
            borderBottom: isLast ? "none" : `1px solid ${surface.border}`,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
            color: text.primary,
            textAlign: "left",
            boxSizing: "border-box",
            transition: "background .12s ease",
        }, onMouseEnter: (e) => { e.currentTarget.style.background = surface.hover; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; }, children: [PROVIDER_BRAND[p.name] && (_jsx("img", { src: PROVIDER_BRAND[p.name].icon, alt: "", width: 22, height: 22, style: { borderRadius: 5, flex: "none" } })), _jsx("span", { style: { fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "none" }, children: p.label }), showPreferred && (_jsx("span", { style: { color: text.tertiary, fontSize: 12, fontWeight: 400, whiteSpace: "nowrap" }, children: t("preferredProviderLabel") })), _jsxs("span", { style: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }, children: [_jsx(ProviderRowRight, { t: t, status: status, statusText: statusText, dotState: dotState, statusColor: statusColor, quota: quota }), _jsx("span", { style: { color: text.tertiary, display: "inline-flex", alignItems: "center" }, children: _jsx(IconChevronRightOutline14, { size: 14 }) })] })] }));
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
                                void run(); } }) }), _jsx(Button, { variant: "primary", size: "md", onClick: () => void run(), disabled: testing || !query.trim(), children: testing ? t("searching") : t("search") })] }), result && !cleared && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [result.ok ? (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, color: stateColor.success, fontSize: 13 }, children: [_jsx(StateDot, { state: "done", size: 8 }), _jsxs("span", { style: { fontWeight: 600 }, children: [t("usingProviderPrefix"), label(result.backend ?? ""), " \u00B7 ", (result.latencyMs / 1000).toFixed(2), " ", t("secondsUnit"), " \u00B7 ", t("resultCount", { n: result.resultCount ?? 0 })] }), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setCleared(true), children: t("clearResult") }) })] })) : (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, color: stateColor.danger, fontSize: 13 }, children: [_jsx(StateDot, { state: "error", size: 8 }), _jsx("span", { style: { fontWeight: 600 }, children: result.error?.message ?? t("unknownOutcome") }), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setCleared(true), children: t("clearResult") }) })] })), attempts.length > 0 && (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: text.secondary }, children: attempts.map((a, i) => {
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
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [detailFor, setDetailFor] = useState(null);
    const [routingOpen, setRoutingOpen] = useState(false);
    const [providerTestResults, setProviderTestResults] = useState({});
    const [busyProviders, setBusyProviders] = useState({});
    const [timeoutDraftSec, setTimeoutDraftSec] = useState("");
    const loadToken = useRef(0);
    const mounted = useRef(true);
    useEffect(() => {
        if (config?.providerAttemptTimeoutMs !== undefined) {
            setTimeoutDraftSec(String(Math.round(config.providerAttemptTimeoutMs / 1000)));
        }
    }, [config?.providerAttemptTimeoutMs]);
    const load = async () => {
        const token = ++loadToken.current;
        try {
            const cfg = await api.configGet();
            if (token !== loadToken.current)
                return;
            setConfig(cfg);
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
    const enabledNames = new Set(config.providers.filter((p) => p.enabled).map((p) => p.name));
    const saveOrder = (ordered, policy = config.searchRoutingPolicy ?? "ordered") => {
        const next = ordered.filter((n, i) => ordered.indexOf(n) === i);
        void api.routingSet(policy, next).then(() => load()).catch((e) => setError(e instanceof Error ? e.message : String(e)));
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
        @media (max-width: 640px) {
          .wt-provider-row { flex-wrap: wrap; row-gap: 4px; }
          .wt-provider-meta { flex-basis: 100%; order: 10; padding-left: 22px; }
        }
      ` }), _jsxs("div", { style: { display: "flex", alignItems: "flex-start", gap: 12 }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("h2", { style: { margin: 0, fontSize: 16, fontWeight: 500, lineHeight: "24px", color: text.primary }, children: t("title") }), _jsx("p", { style: { margin: "2px 0 0", fontSize: 14, lineHeight: "22px", color: text.tertiary }, children: t("tagline") })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, paddingTop: 2, flex: "none", flexWrap: "wrap", justifyContent: "flex-end" }, children: [_jsx(Switch, { checked: config.enabled, onChange: setEnabled, label: config.enabled ? t("enabledLabel") : t("disabledLabel") }), saving && _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("saving") }), saved && !saving && _jsx("span", { style: { color: stateColor.success, fontSize: 12 }, children: t("saved") })] })] }), error && _jsx("div", { style: { color: stateColor.danger, fontSize: 13 }, children: error }), config.proxy?.configured === true && config.proxy?.degraded === true && (_jsxs("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${stateColor.warning}`,
                    background: surface.layer1,
                    fontSize: 13,
                    color: text.secondary,
                }, children: [_jsx("strong", { style: { color: stateColor.warning, fontSize: 13 }, children: t("proxyDegradedTitle") }), _jsx("span", { children: t("proxyDegradedBody") })] })), _jsxs("section", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsx("h3", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: text.primary }, children: t("routingLabel") }), _jsx("button", { type: "button", onClick: () => setRoutingOpen(true), title: t("routingConfigure"), "aria-label": t("routingConfigure"), style: {
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 4,
                                    borderRadius: 6,
                                    color: text.secondary,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }, onMouseEnter: (e) => { e.currentTarget.style.background = surface.hover; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; }, children: _jsx(IconEditOutline16, { size: 14 }) })] }), _jsxs("div", { style: { fontSize: 12, color: text.secondary, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [_jsxs("span", { style: { color: text.tertiary }, children: [t(`routingPolicy.${config.searchRoutingPolicy ?? "ordered"}`), " \u00B7"] }), _jsx("span", { children: (() => {
                                    const names = orderedProviders.map((name) => providerOf(name)?.label ?? name);
                                    const separator = (config.searchRoutingPolicy ?? "ordered") === "random" ? (t("save") === "保存" ? "、" : ", ") : " → ";
                                    if (names.length <= 3) {
                                        return names.join(separator);
                                    }
                                    const head = names.slice(0, 3).join(separator);
                                    return `${head} · +${names.length - 3}`;
                                })() })] })] }), _jsxs("section", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [_jsx("div", { style: { display: "flex", alignItems: "center" }, children: _jsx("h3", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: text.primary }, children: t("providersLabel") }) }), _jsx("div", { style: {
                            display: "flex",
                            flexDirection: "column",
                            background: surface.layer1,
                            border: `1px solid ${surface.border}`,
                            borderRadius: 12,
                            overflow: "hidden",
                        }, children: renderedProviders.map((p, idx) => {
                            const testResult = providerTestResults[p.name];
                            return (_jsx(ProviderRow, { t: t, p: p, quota: quotas?.[p.name], testResult: testResult, inOrder: orderedProviders.includes(p.name), showPreferred: showPreferredFor(p.name), isLast: idx === renderedProviders.length - 1, onClick: () => setDetailFor(p.name) }, p.name));
                        }) })] }), _jsxs("details", { style: { fontSize: 13, borderTop: `1px solid ${surface.border}`, paddingTop: 12, marginTop: 4 }, children: [_jsx("summary", { style: { cursor: "pointer", color: text.secondary, fontSize: 13, fontWeight: 500, padding: "4px 0" }, children: t("diagnosticsAndMore") }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 16, padding: "12px 0 0" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [_jsx("label", { style: { color: text.secondary, fontSize: 13 }, children: t("attemptTimeoutLabel") }), _jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [_jsx("input", { type: "number", min: 1, max: 60, step: 1, value: timeoutDraftSec, onChange: (e) => setTimeoutDraftSec(e.target.value), onBlur: () => commitTimeoutSec(timeoutDraftSec), onKeyDown: (e) => {
                                                    if (e.key === "Enter") {
                                                        e.currentTarget.blur();
                                                    }
                                                }, style: {
                                                    width: 64,
                                                    padding: "4px 8px",
                                                    borderRadius: 6,
                                                    border: `1px solid ${surface.border}`,
                                                    background: surface.layer2,
                                                    color: text.primary,
                                                    fontFamily: "inherit",
                                                    fontSize: 13,
                                                } }), _jsx("span", { style: { color: text.secondary, fontSize: 13 }, children: t("secondsUnit") })] }), _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("attemptTimeoutHint") })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [_jsx("span", { style: { fontSize: 13, fontWeight: 500, color: text.primary }, children: t("testSearchTitle") }), _jsx(TestSearchBlock, { t: t, config: config, onError: (msg) => setError(msg) })] })] })] }), detailProvider && (_jsx(ProviderModal, { t: t, p: detailProvider, quota: quotas?.[detailProvider.name], testResult: providerTestResults[detailProvider.name], busy: !!busyProviders[detailProvider.name], showPreferred: showPreferredFor(detailProvider.name), inChain: orderedProviders.includes(detailProvider.name), onClose: () => { setDetailFor(null); setProviderTestResults((prev) => { const next = { ...prev }; delete next[detailProvider.name]; return next; }); }, onToggle: (enabled) => toggleProvider(detailProvider.name, enabled), onBaseUrl: (url) => setBaseUrl(detailProvider.name, url), onTest: () => testProvider(detailProvider.name), onRefreshQuota: () => void loadQuotas(true), onConfigChanged: async () => {
                    // Credentials or preferences changed: drop the stale probe so a
                    // previous "no key" / auth error does not linger after the edit.
                    setProviderTestResults((prev) => { const next = { ...prev }; delete next[detailProvider.name]; return next; });
                    await load();
                } })), routingOpen && (_jsx(RoutingModal, { t: t, providers: config.providers, ordered: orderedProviders, currentPolicy: config.searchRoutingPolicy ?? "ordered", onClose: () => setRoutingOpen(false), onSave: saveOrder }))] }));
}
