import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * dsh-web-tools — provider detail dialog (Modal).
 *
 * Compact, fixed-height layout: header/footer are sticky, body scrolls.
 * Overview (status + quota) compressed into one line; credentials collapsed
 * by default.
 * @module
 */
import { useState } from "react";
import { Button, IconChevronRightOutline14, IconPlusOutline16, IconRefreshOutline16, IconTrashOutline16, Modal, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "./api.js";
import { text, surface, state as stateColor } from "./theme.js";
import { Switch } from "./WebToolsSection.js";
import { providerStatusOf, testOutcomeStatus, quotaSummary, quotaFraction, quotaRemainingLabel, quotaDisplayKind } from "./logic.js";
import { ProviderPreferencesSection } from "./provider-preferences/ProviderPreferencesSection.js";
import { PROVIDER_BRAND } from "./brand.js";
/** Quiet human source label (no "Official/Authoritative" tag stacking). */
function quotaSourceLabel(t, source) {
    if (!source)
        return "";
    const key = `quotaSource${source[0].toUpperCase()}${source.slice(1)}`;
    const value = t(key);
    return value !== key ? value : t("quotaSource", { s: source });
}
/** Full rich quota display: progress bar, percentage, source, updated-ago, breakdown. */
function QuotaSection(props) {
    const { quota, t, onRefresh } = props;
    const [refreshing, setRefreshing] = useState(false);
    const kind = quotaDisplayKind(quota);
    if (kind === "unavailable" || kind === "self_hosted")
        return null;
    const fraction = quotaFraction(quota);
    const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || "";
    const ago = quota.fetchedAt !== undefined
        ? (quota.fetchedAt > Date.now() - 60_000 ? t("updatedJustNow") : t("updatedAgo", { mins: Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 60_000)) }))
        : undefined;
    const overPlan = quota.remaining !== undefined && quota.limit !== undefined && quota.remaining > quota.limit
        ? t("quotaOverPlan", { r: quota.remaining.toLocaleString(), l: quota.limit.toLocaleString() })
        : undefined;
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
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${surface.border}`, paddingTop: 12 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsx("span", { style: { fontWeight: 600, fontSize: 13, color: text.primary }, children: t("quotaTitle") }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { fontSize: 13, color: text.secondary, fontWeight: 500 }, children: label }), _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconRefreshOutline16, { size: 12 }), onClick: () => void refresh(), disabled: refreshing, style: { padding: "2px 4px" }, children: t("refreshQuota") })] })] }), fraction !== undefined && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("div", { style: { flex: 1, height: 6, borderRadius: 3, background: surface.layer2, overflow: "hidden" }, children: _jsx("div", { style: { width: `${fraction * 100}%`, height: "100%", background: stateColor.success, transition: "width .3s ease" } }) }), _jsxs("span", { style: { fontSize: 11, fontWeight: 600, color: stateColor.success }, children: [Math.round(fraction * 100), "%"] })] })), meta && _jsx("span", { style: { color: text.tertiary, fontSize: 11 }, children: meta }), quota.breakdown && Object.keys(quota.breakdown).length > 0 && (_jsxs("span", { style: { color: text.tertiary, fontSize: 11 }, children: [t("usage"), ": ", Object.entries(quota.breakdown).map(([k, v]) => `${k} ${v}`).join(" · ")] }))] }));
}
/** Developer layer: raw provider-native parameters. Effective values are
 *  read-only; overrides are editable as JSON (parsed + saved through the
 *  Host's sanitize gate). */
function DeveloperOptions(props) {
    const { t, p, onConfigChanged } = props;
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [parseError, setParseError] = useState("");
    const [saving, setSaving] = useState(false);
    const effective = p.options?.effective ?? {};
    const overrides = p.options?.overrides ?? {};
    const hasOverrides = Object.keys(overrides).length > 0;
    const jsonBox = {
        marginTop: 8,
        padding: "8px 10px",
        borderRadius: 8,
        background: surface.layer2,
        border: `1px solid ${surface.border}`,
        fontFamily: "var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace)",
        fontSize: 12,
        lineHeight: 1.5,
        color: text.secondary,
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
    };
    const startEdit = () => {
        setDraft(JSON.stringify(overrides, null, 2));
        setParseError("");
        setEditing(true);
    };
    const cancelEdit = () => {
        setEditing(false);
        setParseError("");
    };
    const saveEdit = async () => {
        let parsed;
        try {
            parsed = JSON.parse(draft);
        }
        catch {
            setParseError(t("developerParseError"));
            return;
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            parsed = {};
        }
        setSaving(true);
        setParseError("");
        try {
            await api.providerOptionsSet(p.name, parsed);
            onConfigChanged();
            setEditing(false);
        }
        catch (e) {
            setParseError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsxs("div", { style: { borderTop: `1px solid ${surface.border}`, paddingTop: 12, marginTop: 2 }, children: [_jsxs("div", { role: "button", tabIndex: 0, "aria-expanded": open, onClick: () => setOpen(!open), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen(!open);
                } }, style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", outline: "none" }, children: [_jsx("span", { style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", color: text.tertiary, display: "inline-flex", flex: "none" }, children: _jsx(IconChevronRightOutline14, { size: 12 }) }), _jsx("span", { style: { fontWeight: 600, fontSize: 13, color: text.primary }, children: t("developerOptions") }), _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("developerOptionsHint") })] }), open && (_jsxs("div", { children: [_jsx("div", { style: { fontSize: 11, color: text.tertiary, marginTop: 10 }, children: t("developerEffective") }), _jsx("pre", { style: jsonBox, children: JSON.stringify(effective, null, 2) }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 10 }, children: [_jsx("span", { style: { fontSize: 11, color: text.tertiary }, children: t("developerOverrides") }), _jsx("span", { style: { marginLeft: "auto" }, children: editing ? (_jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: cancelEdit, disabled: saving, children: t("developerEditCancel") }), _jsx(Button, { size: "sm", variant: "primary", onClick: () => void saveEdit(), disabled: saving, children: t("developerEditSave") })] })) : (_jsx(Button, { size: "sm", variant: "outline", onClick: startEdit, children: t("developerEdit") })) })] }), editing ? (_jsxs(_Fragment, { children: [_jsx("textarea", { value: draft, onChange: (e) => setDraft(e.target.value), rows: 6, spellCheck: false, style: {
                                    ...jsonBox,
                                    resize: "vertical",
                                    outline: "none",
                                    color: text.primary,
                                } }), _jsx("div", { style: { fontSize: 11, color: text.tertiary, marginTop: 4 }, children: t("developerEditHint") })] })) : hasOverrides ? (_jsx("pre", { style: jsonBox, children: JSON.stringify(overrides, null, 2) })) : (_jsx("div", { style: { fontSize: 12, color: text.tertiary, marginTop: 6 }, children: t("developerNoOverrides") })), parseError && _jsx("div", { style: { fontSize: 12, color: stateColor.danger, marginTop: 6 }, children: parseError })] }))] }));
}
function CredentialDisclosure(props) {
    const { t, p, onChanged, onError } = props;
    const [open, setOpen] = useState(false);
    const keys = p.keys ?? [];
    const invalidCount = keys.filter((k) => !k.healthy).length;
    const allHealthy = keys.length > 0 && invalidCount === 0;
    const summaryText = keys.length === 0
        ? t("notConfigured")
        : allHealthy
            ? t("keyReady")
            : t("keysSomeIssues", { n: invalidCount });
    const summaryColor = keys.length === 0
        ? text.tertiary
        : allHealthy
            ? stateColor.success
            : stateColor.danger;
    const canOpen = p.keyWritable;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${surface.border}`, paddingTop: 12 }, children: [_jsxs("div", { role: "button", tabIndex: 0, "aria-expanded": open, onClick: () => canOpen && setOpen(!open), onKeyDown: (e) => { if ((e.key === "Enter" || e.key === " ") && canOpen) {
                    e.preventDefault();
                    setOpen(!open);
                } }, style: { display: "flex", alignItems: "center", justifyContent: "space-between", cursor: canOpen ? "pointer" : "default", outline: "none" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", color: text.tertiary, display: "inline-flex", flex: "none" }, children: _jsx(IconChevronRightOutline14, { size: 12 }) }), _jsx("span", { style: { fontWeight: 600, fontSize: 13, color: text.primary }, children: t("credentials") })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: allHealthy ? 400 : 600, color: summaryColor }, children: summaryText }), keys.length === 0 && canOpen && (_jsx(Button, { size: "sm", variant: "ghost", onClick: (e) => { e.stopPropagation(); setOpen(true); }, style: { fontSize: 11 }, children: t("addKey") })), keys.length > 0 && (_jsx(Button, { size: "sm", variant: "ghost", onClick: (e) => { e.stopPropagation(); setOpen(!open); }, style: { fontSize: 11 }, children: open ? t("collapse") : t("manage") }))] })] }), open && p.keyWritable && (_jsx("div", { style: { paddingLeft: 18, marginTop: 4 }, children: _jsx(CredentialList, { t: t, p: p, onChanged: onChanged, onError: onError }) }))] }));
}
/** Key list body (same as before, extracted for clarity). Adding a key
 *  updates the config state but never auto-runs a paid search — the user
 *  clicks 测试连接 themselves. */
function CredentialList(props) {
    const { t, p, onChanged, onError } = props;
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
            onChanged();
        }
        catch (e) {
            onError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(null);
        }
    };
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [keys.map((k) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 }, children: [_jsx("span", { style: { fontFamily: "var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace)", color: text.primary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: k.hint }), _jsx("span", { style: { color: k.healthy ? stateColor.success : stateColor.danger, fontSize: 12, whiteSpace: "nowrap" }, children: k.healthy ? t("keyReady") : t("keyAuthError") }), _jsx("span", { style: { marginLeft: "auto" }, children: _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconTrashOutline16, { size: 14 }), onClick: () => void removeKey(k.id), disabled: busy === k.id, "aria-label": t("removeKey") }) })] }, k.id))), adding ? (_jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center", marginTop: 4 }, children: [_jsx("input", { autoFocus: true, type: "password", value: draft, onChange: (e) => setDraft(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                            void addKey(); }, placeholder: t("addKeyPlaceholder"), style: { flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${surface.border}`, background: surface.layer2, color: text.primary, fontFamily: "inherit", fontSize: 13 } }), _jsx(Button, { size: "sm", variant: "primary", onClick: () => void addKey(), disabled: busy === "add" || !draft.trim(), children: t("add") }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => { setAdding(false); setDraft(""); }, children: t("cancel") })] })) : (_jsx("div", { style: { marginTop: 4 }, children: _jsx(Button, { size: "sm", variant: "outline", icon: _jsx(IconPlusOutline16, { size: 14 }), onClick: () => setAdding(true), children: t("addKey") }) }))] }));
}
/** Connection settings (Base URL / custom endpoints) as a clean Settings Row. */
function ConnectionSettingsDisclosure(props) {
    const { t, p, draftBaseUrl, setDraftBaseUrl, onBaseUrl } = props;
    const selfHosted = p.name === "searxng";
    const [open, setOpen] = useState(selfHosted);
    const isConfigured = !!p.baseUrl;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${surface.border}`, paddingTop: 12 }, children: [_jsxs("div", { role: "button", tabIndex: 0, "aria-expanded": open, onClick: () => setOpen(!open), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen(!open);
                } }, style: { display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", outline: "none" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", color: text.tertiary, display: "inline-flex", flex: "none" }, children: _jsx(IconChevronRightOutline14, { size: 12 }) }), _jsx("span", { style: { fontWeight: 600, fontSize: 13, color: text.primary }, children: t("connectionSettings") })] }), _jsx("span", { style: { fontSize: 12, color: isConfigured ? "var(--dsw-alias-brand-primary)" : text.tertiary }, children: isConfigured ? t("connectionConfigured") : t("connectionDefault") })] }), open && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, paddingLeft: 18, marginTop: 4 }, children: [_jsx("label", { style: { fontSize: 12, color: text.secondary }, children: t("serviceAddress") }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { value: draftBaseUrl, onChange: (e) => setDraftBaseUrl(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") {
                                    onBaseUrl(draftBaseUrl.trim());
                                    e.target.blur();
                                } }, onBlur: () => { if (draftBaseUrl.trim() !== (p.baseUrl ?? ""))
                                    onBaseUrl(draftBaseUrl.trim()); }, placeholder: t("baseUrlPlaceholder"), style: { flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${surface.border}`, background: surface.layer2, color: text.primary, fontFamily: "inherit", fontSize: 13 } }), p.baseUrl && (_jsx(Button, { size: "sm", variant: "ghost", onClick: () => { setDraftBaseUrl(""); onBaseUrl(""); }, children: t("restoreDefaultUrl") }))] })] }))] }));
}
export function ProviderModal(props) {
    const { t, p, quota, testResult, busy, showPreferred, inChain, onClose, onToggle, onBaseUrl, onTest, onRefreshQuota, onConfigChanged } = props;
    const [localError, setLocalError] = useState("");
    const [draftBaseUrl, setDraftBaseUrl] = useState(p.baseUrl ?? "");
    const base = providerStatusOf(p, quota, inChain);
    const status = base === "ready" ? (testOutcomeStatus(testResult) ?? base) : base;
    const statusText = {
        ready: t("ready"), "rate-limited": t("rateLimited"), "auth-error": t("authError"),
        "unreachable": t("unreachable"), "not-configured": t("notConfigured"), "disabled": t("disabled"), "not-in-order": t("notInOrder"),
    }[status];
    const statusState = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
    const statusColor = status === "ready" ? stateColor.success : status === "auth-error" ? stateColor.danger : status === "rate-limited" || status === "unreachable" ? stateColor.warning : text.tertiary;
    const selfHosted = p.name === "searxng";
    const [refreshing, setRefreshing] = useState(false);
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: `
        .wt-modal-dialog {
          width: 720px !important;
          max-height: min(760px, calc(100vh - 48px)) !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .wt-modal-content {
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
        }
        @media (max-width: 760px) {
          .wt-modal-dialog { width: calc(100vw - 24px) !important; }
        }
      ` }), _jsx(Modal, { open: true, onClose: onClose, title: p.label, closeLabel: t("close"), description: t(`capability.${p.name}`) || "", className: "wt-modal-dialog", contentClassName: "wt-modal-content", footer: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx(Button, { variant: "outline", onClick: onTest, disabled: busy, style: { flex: "none" }, children: busy ? t("testingConnection") : t("testConnection") }), testResult && (_jsxs("span", { style: { fontSize: 12, color: testResult.ok ? stateColor.success : stateColor.danger, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [_jsx(StateDot, { state: testResult.ok ? "done" : "error", size: 8 }), testResult.ok
                                    ? `${t("testOk")} · ${testResult.latencyMs}ms · ${t("resultCount", { n: testResult.resultCount ?? 0 })}`
                                    : `${t("testFail")}: ${testResult.error?.message ?? ""}`] })), _jsx("span", { style: { marginLeft: "auto", flex: "none" }, children: _jsx(Button, { variant: "ghost", onClick: onClose, children: t("close") }) })] }), children: _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [_jsx(Switch, { checked: p.enabled, onChange: onToggle, label: p.enabled ? t("enabledLabel") : t("disabledLabel") }), _jsx("span", { style: { color: text.secondary, fontSize: 13 }, children: p.enabled ? t("enabledLabel") : t("disabledLabel") }), showPreferred && (_jsx("span", { style: { color: "var(--dsw-alias-brand-primary)", fontSize: 11, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px" }, children: t("preferredProviderLabel") })), !inChain && _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("notInOrder") }), _jsxs("span", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }, children: [statusState === "hollow" ? (_jsx("span", { "aria-hidden": true, style: { width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${text.tertiary}`, flex: "none", boxSizing: "border-box" } })) : (_jsx(StateDot, { state: statusState, size: 8 })), _jsx("span", { style: { color: statusColor, fontWeight: 500, fontSize: 13 }, children: statusText })] })] }), quota && _jsx(QuotaSection, { quota: quota, t: t, onRefresh: onRefreshQuota }), !selfHosted && _jsx(CredentialDisclosure, { t: t, p: p, onChanged: onConfigChanged, onError: setLocalError }), (selfHosted || p.baseUrl !== undefined) && (_jsx(ConnectionSettingsDisclosure, { t: t, p: p, draftBaseUrl: draftBaseUrl, setDraftBaseUrl: setDraftBaseUrl, onBaseUrl: onBaseUrl })), _jsx(ProviderPreferencesSection, { t: t, p: p, onConfigChanged: onConfigChanged }), _jsx(DeveloperOptions, { t: t, p: p, onConfigChanged: onConfigChanged }), localError && _jsx("div", { style: { color: stateColor.danger, fontSize: 12 }, children: localError })] }) })] }));
}
