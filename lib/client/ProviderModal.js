import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — provider detail dialog (Modal).
 *
 * One provider's full management surface: enabled switch, status, quota with
 * progress + refresh, per-key credential list with add/remove (the Host keeps
 * its comma-joined credential string; the browser only ever sees masked
 * hints), self-hosted Base URL, and a connection test.
 *
 * Default page shows NO password input — editing happens one key at a time.
 * @module
 */
import { useState } from "react";
import { Button, IconPlusOutline16, IconRefreshOutline16, IconTrashOutline16, Modal, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "./api.js";
import { text, surface, state as stateColor } from "./theme.js";
import { Switch } from "./WebToolsSection.js";
import { providerStatusOf, testOutcomeStatus, quotaSummary, quotaFraction, quotaRemainingLabel, quotaDisplayKind, formatProviderOptionsSummary } from "./logic.js";
function QuotaBar(props) {
    const { quota, t, onRefresh } = props;
    const [refreshing, setRefreshing] = useState(false);
    const kind = quotaDisplayKind(quota);
    // Unsupported / self-hosted / unlimited: one quiet line, no buttons.
    if (kind === "unavailable") {
        return _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("quotaUnavailable") });
    }
    if (kind === "self_hosted") {
        return _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("quotaSelfHostedShort") });
    }
    if (kind === "unlimited") {
        return _jsx("span", { style: { color: text.secondary, fontSize: 12 }, children: t("quotaUnlimited") });
    }
    // Conditional progress: a bar is drawn ONLY when remaining ≤ limit in a
    // countable unit (quotaFraction handles the honesty rule). Fill = GREEN
    // (remaining share), track = gray (used share).
    const fraction = quotaFraction(quota);
    const fillColor = stateColor.success;
    const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || t("quotaUnavailable");
    const ago = quota.fetchedAt !== undefined
        ? (quota.fetchedAt > Date.now() - 60_000 ? t("updatedJustNow") : t("updatedAgo", { mins: Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 60_000)) }))
        : undefined;
    // Over-plan (bonus above the plan): show remaining vs plan as text, never
    // a >100% bar. quotaFraction already returns undefined in that case.
    const overPlan = quota.remaining !== undefined && quota.limit !== undefined && quota.remaining > quota.limit
        ? t("quotaOverPlan", { r: quota.remaining.toLocaleString(), l: quota.limit.toLocaleString() })
        : undefined;
    // One quiet meta line: over-plan / source · updated (no stacking).
    const meta = [overPlan, quotaSourceLabel(t, quota.source), ago]
        .filter((x) => typeof x === "string" && x.length > 0)
        .join(" · ");
    const refresh = async () => {
        setRefreshing(true);
        try {
            onRefresh();
        }
        finally {
            setTimeout(() => setRefreshing(false), 600);
        }
    };
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { style: { fontSize: 14, color: text.primary }, children: label }), fraction !== undefined && (_jsxs("span", { style: { color: fillColor, fontSize: 12, fontWeight: 600 }, children: [Math.round(fraction * 100), "%"] })), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconRefreshOutline16, { size: 14 }), onClick: () => void refresh(), disabled: refreshing, children: t("refreshQuota") }) })] }), fraction !== undefined && (_jsx("div", { style: { height: 6, borderRadius: 3, background: surface.layer2, overflow: "hidden" }, children: _jsx("div", { style: { width: `${fraction * 100}%`, height: "100%", background: fillColor, transition: "width .3s ease" } }) })), meta && _jsx("span", { style: { color: text.tertiary, fontSize: 11 }, children: meta }), quota.breakdown && Object.keys(quota.breakdown).length > 0 && (_jsxs("span", { style: { color: text.tertiary, fontSize: 11 }, children: [t("usage"), ": ", Object.entries(quota.breakdown).map(([k, v]) => `${k} ${v}`).join(" · ")] }))] }));
}
/** Quiet human source label (no "Official/Authoritative" tag stacking). */
function quotaSourceLabel(t, source) {
    if (!source)
        return "";
    const key = `quotaSource${source[0].toUpperCase()}${source.slice(1)}`;
    const value = t(key);
    return value !== key ? value : t("quotaSource", { s: source });
}
/** Credential list: masked hints + health + add/remove (no plaintext). */
function CredentialList(props) {
    const { t, p, onChanged, onAfterChange, onError } = props;
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(null);
    const keys = p.keys ?? [];
    const addKey = async () => {
        const value = draft.trim();
        if (!value)
            return;
        setBusy("add");
        try {
            await api.credentialsAddKey(p.name, value);
            setDraft("");
            setAdding(false);
            onChanged();
            // Real connection test with the freshly added key — "configured" is not
            // "connected", so the card must verify before showing a green state.
            // Reload AFTER the test so the tested key's health lands in the list.
            await onAfterChange();
            onChanged();
        }
        catch (e) {
            onError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(null);
        }
    };
    const removeKey = async (keyId) => {
        setBusy(keyId);
        try {
            await api.credentialsRemoveKey(p.name, keyId);
            // No auto test after removal: with the last key gone the probe would
            // only produce a misleading "no API key configured" error. The card
            // reload reflects the smaller pool; the operator can test again.
            onChanged();
        }
        catch (e) {
            onError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(null);
        }
    };
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [keys.length > 0 && (_jsx("span", { style: { color: text.secondary, fontSize: 12 }, children: t("keysConfigured", { n: keys.length }) })), keys.map((k) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 }, children: [_jsx("span", { style: { fontFamily: "var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace)", color: text.primary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: k.hint }), _jsx("span", { style: { color: k.healthy ? stateColor.success : stateColor.danger, fontSize: 12, whiteSpace: "nowrap" }, children: k.healthy ? t("keyReady") : t("keyAuthError") }), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconTrashOutline16, { size: 14 }), onClick: () => void removeKey(k.id), disabled: busy === k.id, "aria-label": t("removeKey") }) })] }, k.id))), adding ? (_jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center", marginTop: 4 }, children: [_jsx("input", { autoFocus: true, type: "password", value: draft, onChange: (e) => setDraft(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                            void addKey(); }, placeholder: t("addKeyPlaceholder"), style: {
                            flex: 1,
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: `1px solid ${surface.border}`,
                            background: surface.layer2,
                            color: text.primary,
                            fontFamily: "inherit",
                            fontSize: 13,
                        } }), _jsx(Button, { size: "sm", variant: "primary", onClick: () => void addKey(), disabled: busy === "add" || !draft.trim(), children: t("add") }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => { setAdding(false); setDraft(""); }, children: t("cancel") })] })) : (_jsx("div", { style: { marginTop: 4 }, children: _jsx(Button, { size: "sm", variant: "outline", icon: _jsx(IconPlusOutline16, { size: 14 }), onClick: () => setAdding(true), children: t("addKey") }) }))] }));
}
export function ProviderModal(props) {
    const { t, p, quota, testResult, busy, isDefault, inChain, onClose, onToggle, onBaseUrl, onTest, onRefreshQuota, onConfigChanged } = props;
    const [localError, setLocalError] = useState("");
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
    // Gray hollow dot for unconfigured / not-in-chain; colored only for real states.
    const statusState = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
    const statusColor = status === "ready" ? stateColor.success : status === "auth-error" ? stateColor.danger : status === "rate-limited" || status === "unreachable" ? stateColor.warning : text.tertiary;
    const selfHosted = p.name === "searxng";
    return (_jsx(Modal, { open: true, onClose: onClose, title: p.label, closeLabel: t("close"), description: p.description, footer: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx(Button, { variant: "primary", onClick: onTest, disabled: busy, style: { flex: "none" }, children: busy ? t("testingConnection") : t("testConnection") }), testResult && (_jsxs("span", { style: { fontSize: 12, color: testResult.ok ? stateColor.success : stateColor.danger, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [_jsx(StateDot, { state: testResult.ok ? "done" : "error", size: 8 }), testResult.ok
                            ? `${t("testOk")} · ${testResult.latencyMs}ms · ${t("resultCount", { n: testResult.resultCount ?? 0 })}`
                            : `${t("testFail")}: ${testResult.error?.message ?? ""}`] })), _jsx("span", { style: { marginLeft: "auto", flex: "none" }, children: _jsx(Button, { variant: "ghost", onClick: onClose, children: t("close") }) })] }), children: _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 20 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(Switch, { checked: p.enabled, onChange: onToggle, label: p.enabled ? t("enabledLabel") : t("disabledLabel") }), _jsx("span", { style: { color: text.secondary, fontSize: 13 }, children: p.enabled ? t("enabledLabel") : t("disabledLabel") }), isDefault && (_jsx("span", { style: { color: "var(--dsw-alias-brand-primary)", fontSize: 12, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px" }, children: t("defaultProviderLabel") })), !inChain && _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("notInChain") })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx("h4", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: text.secondary }, children: t("providerStatus") }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 14 }, children: [statusState === "hollow" ? (_jsx("span", { "aria-hidden": true, style: { width: 10, height: 10, borderRadius: "50%", border: `1.5px solid ${text.tertiary}`, flex: "none", boxSizing: "border-box" } })) : (_jsx(StateDot, { state: statusState, size: 10 })), _jsx("span", { style: { color: statusColor, fontWeight: 500 }, children: statusText }), status === "ready" && _jsxs("span", { style: { color: text.tertiary, fontSize: 12 }, children: ["\u00B7 ", t("connected")] })] })] }), quota && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx("h4", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: text.secondary }, children: t("quotaTitle") }), _jsx(QuotaBar, { quota: quota, t: t, onRefresh: onRefreshQuota })] })), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx("h4", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: text.secondary }, children: t("credentials") }), p.keyWritable ? (_jsx(CredentialList, { t: t, p: p, onChanged: onConfigChanged, onAfterChange: onTest, onError: setLocalError })) : (_jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("notConfigured") }))] }), (selfHosted || p.baseUrl !== undefined) && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx("h4", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: text.secondary }, children: t("baseUrlLabel") }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { value: p.baseUrl ?? "", onChange: (e) => onBaseUrl(e.target.value), placeholder: t("baseUrlPlaceholder"), style: {
                                        flex: 1,
                                        padding: "6px 10px",
                                        borderRadius: 6,
                                        border: `1px solid ${surface.border}`,
                                        background: surface.layer2,
                                        color: text.primary,
                                        fontFamily: "inherit",
                                        fontSize: 13,
                                    } }), !p.baseUrl && _jsx("span", { style: { color: text.tertiary, fontSize: 12, whiteSpace: "nowrap" }, children: t("baseUrlDefault") })] })] })), _jsx(ProviderPreferencesSection, { t: t, p: p, onConfigChanged: onConfigChanged }), localError && _jsx("div", { style: { color: stateColor.danger, fontSize: 12 }, children: localError })] }) }));
}
function ProviderPreferencesSection({ t, p, onConfigChanged }) {
    if (!p.options || p.name === "jina" || p.name === "searxng")
        return null;
    const [expanded, setExpanded] = useState(false);
    const [draft, setDraft] = useState(() => ({ ...p.options?.overrides }));
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);
    const eff = p.options.effective;
    const isDef = p.options.isDefault;
    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            await api.providerOptionsSet(p.name, draft);
            onConfigChanged();
            setMsg("已保存");
            setTimeout(() => setMsg(null), 2000);
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
            setTimeout(() => setMsg(null), 2000);
        }
        catch {
            setMsg("恢复失败");
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsxs("div", { style: { marginTop: 16, borderTop: `1px solid ${border.subtle}`, paddingTop: 14 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, fontSize: 13, color: text.primary }, children: "\u641C\u7D22\u504F\u597D" }), _jsx("div", { style: { fontSize: 12, color: isDef ? text.secondary : stateColor.info, marginTop: 2 }, children: formatProviderOptionsSummary(p.name, eff) })] }), _jsx("button", { type: "button", onClick: () => setExpanded(!expanded), style: { padding: "4px 10px", fontSize: 12, borderRadius: 4, cursor: "pointer", border: `1px solid ${border.default}`, background: "transparent", color: text.primary }, children: expanded ? "收起" : "自定义" })] }), expanded && (_jsxs("div", { style: { marginTop: 12, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }, children: [p.name === "exa" && (_jsxs("div", { children: [_jsx("label", { style: { display: "block", fontSize: 12, fontWeight: 500, color: text.secondary, marginBottom: 4 }, children: "\u68C0\u7D22\u65B9\u5F0F" }), _jsxs("select", { value: draft.searchType ?? "auto", onChange: (e) => setDraft({ ...draft, searchType: e.target.value }), style: { width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${border.default}` }, children: [_jsx("option", { value: "auto", children: "\u81EA\u52A8\u5E73\u8861\uFF08\u63A8\u8350\uFF09" }), _jsx("option", { value: "fast", children: "\u5FEB\u901F\uFF08\u66F4\u4F4E\u5EF6\u8FDF\uFF09" }), _jsx("option", { value: "instant", children: "\u6781\u901F\uFF08\u6700\u4F4E\u5EF6\u8FDF\uFF09" }), _jsx("option", { value: "deep-lite", children: "\u6DF1\u5EA6\u6982\u89C8\uFF08\u8F83\u6162\uFF09" }), _jsx("option", { value: "deep", children: "\u6DF1\u5EA6\u68C0\u7D22\uFF08\u6162\uFF09" }), _jsx("option", { value: "deep-reasoning", children: "\u6DF1\u5EA6\u63A8\u7406\uFF08\u6700\u8BE6\u5C3D\uFF09" })] })] })), p.name === "tavily" && (_jsxs("div", { children: [_jsx("label", { style: { display: "block", fontSize: 12, fontWeight: 500, color: text.secondary, marginBottom: 4 }, children: "\u68C0\u7D22\u6DF1\u5EA6" }), _jsxs("select", { value: draft.searchDepth ?? "basic", onChange: (e) => setDraft({ ...draft, searchDepth: e.target.value }), style: { width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${border.default}` }, children: [_jsx("option", { value: "basic", children: "\u5E73\u8861\u641C\u7D22\uFF081 credit\uFF0C\u63A8\u8350\uFF09" }), _jsx("option", { value: "fast", children: "\u5FEB\u901F\u641C\u7D22\uFF081 credit\uFF09" }), _jsx("option", { value: "ultra-fast", children: "\u6781\u901F\u641C\u7D22\uFF081 credit\uFF09" }), _jsx("option", { value: "advanced", children: "\u9AD8\u8D28\u91CF\u641C\u7D22\uFF082 credits\uFF09" })] })] })), p.name === "brave" && (_jsxs("div", { children: [_jsx("label", { style: { display: "block", fontSize: 12, fontWeight: 500, color: text.secondary, marginBottom: 4 }, children: "\u68C0\u7D22\u6A21\u5F0F" }), _jsxs("select", { value: draft.endpointPreference ?? "auto", onChange: (e) => setDraft({ ...draft, endpointPreference: e.target.value }), style: { width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${border.default}` }, children: [_jsx("option", { value: "auto", children: "\u667A\u80FD\u4E0A\u4E0B\u6587 \u00B7 \u63A8\u8350\uFF08LLM Context\uFF0C\u5931\u8D25\u81EA\u52A8\u56DE\u9000\uFF09" }), _jsx("option", { value: "llm-context", children: "\u4EC5\u667A\u80FD\u4E0A\u4E0B\u6587\uFF08LLM Context\uFF09" }), _jsx("option", { value: "web-search", children: "\u4F20\u7EDF\u7F51\u9875\u641C\u7D22" })] })] })), p.name === "you" && (_jsxs("div", { children: [_jsx("label", { style: { display: "block", fontSize: 12, fontWeight: 500, color: text.secondary, marginBottom: 4 }, children: "\u68C0\u7D22\u5C55\u73B0" }), _jsxs("select", { value: draft.extractionMode ?? "highlights", onChange: (e) => setDraft({ ...draft, extractionMode: e.target.value }), style: { width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${border.default}` }, children: [_jsx("option", { value: "highlights", children: "AI \u76F8\u5173\u7247\u6BB5\uFF08\u63A8\u8350\uFF0C\u8D28\u91CF\u66F4\u9AD8\uFF09" }), _jsx("option", { value: "none", children: "\u7B80\u77ED\u6458\u8981\uFF08\u8F7B\u91CF\uFF09" })] })] })), p.name === "parallel" && (_jsxs("div", { children: [_jsx("label", { style: { display: "block", fontSize: 12, fontWeight: 500, color: text.secondary, marginBottom: 4 }, children: "\u68C0\u7D22\u8D28\u91CF" }), _jsxs("select", { value: draft.mode ?? "advanced", onChange: (e) => setDraft({ ...draft, mode: e.target.value }), style: { width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${border.default}` }, children: [_jsx("option", { value: "advanced", children: "\u9AD8\u8D28\u91CF\u641C\u7D22\uFF08\u63A8\u8350\uFF09" }), _jsx("option", { value: "basic", children: "\u5FEB\u901F\u641C\u7D22" })] })] })), _jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }, children: [!isDef && (_jsx("button", { type: "button", onClick: handleReset, disabled: saving, style: { padding: "4px 10px", fontSize: 12, borderRadius: 4, cursor: "pointer", border: `1px solid ${border.default}`, background: "transparent", color: text.secondary }, children: "\u6062\u590D\u63A8\u8350" })), _jsx("button", { type: "button", onClick: handleSave, disabled: saving, style: { padding: "4px 12px", fontSize: 12, borderRadius: 4, cursor: "pointer", border: "none", background: stateColor.info, color: "#fff" }, children: saving ? "保存中..." : "保存偏好" })] }), msg && _jsx("div", { style: { fontSize: 12, color: stateColor.info, textAlign: "right" }, children: msg })] }))] }));
}
