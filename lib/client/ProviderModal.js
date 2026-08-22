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
import { Button, IconChevronRightOutline14, IconPlusOutline16, IconTrashOutline16, Modal, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "./api.js";
import { text, surface, state as stateColor } from "./theme.js";
import { Switch } from "./WebToolsSection.js";
import { providerStatusOf, testOutcomeStatus } from "./logic.js";
import { ProviderPreferencesSection } from "./provider-preferences/ProviderPreferencesSection.js";
import { PROVIDER_BRAND } from "./brand.js";
import { SettingsGroup, SettingsRow } from "./ui/SettingsGroup.js";
import { QuotaCard } from "./ui/QuotaInline.js";
/** Quiet human source label (no "Official/Authoritative" tag stacking). */
function quotaSourceLabel(t, source) {
    if (!source)
        return "";
    const key = `quotaSource${source[0].toUpperCase()}${source.slice(1)}`;
    const value = t(key);
    return value !== key ? value : t("quotaSource", { s: source });
}
/** Developer layer: raw provider-native parameters. Effective values are
 *  read-only; overrides are editable as JSON (parsed + saved through the
 *  Host's sanitize gate). */
function DeveloperOptions(props) {
    const { t, p, onConfigChanged } = props;
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
    return (_jsxs("div", { style: { padding: "10px 14px" }, children: [_jsx("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 500, fontSize: 13, color: text.primary }, children: t("developerOptions") }), _jsx("span", { style: { fontSize: 11, color: text.tertiary }, children: t("developerOptionsHint") })] }) }), _jsxs("div", { style: { marginTop: 10 }, children: [_jsx("div", { style: { fontSize: 11, color: text.tertiary, marginTop: 4 }, children: t("developerEffective") }), _jsx("pre", { style: jsonBox, children: JSON.stringify(effective, null, 2) }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 10 }, children: [_jsx("span", { style: { fontSize: 11, color: text.tertiary }, children: t("developerOverrides") }), _jsx("span", { style: { marginLeft: "auto" }, children: editing ? (_jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: cancelEdit, disabled: saving, children: t("developerEditCancel") }), _jsx(Button, { size: "sm", variant: "primary", onClick: () => void saveEdit(), disabled: saving, children: t("developerEditSave") })] })) : (_jsx(Button, { size: "sm", variant: "outline", onClick: startEdit, children: t("developerEdit") })) })] }), editing ? (_jsxs(_Fragment, { children: [_jsx("textarea", { value: draft, onChange: (e) => setDraft(e.target.value), rows: 6, spellCheck: false, style: {
                                    ...jsonBox,
                                    resize: "vertical",
                                    outline: "none",
                                    color: text.primary,
                                } }), _jsx("div", { style: { fontSize: 11, color: text.tertiary, marginTop: 4 }, children: t("developerEditHint") })] })) : hasOverrides ? (_jsx("pre", { style: jsonBox, children: JSON.stringify(overrides, null, 2) })) : (_jsx("div", { style: { fontSize: 12, color: text.tertiary, marginTop: 6 }, children: t("developerNoOverrides") })), parseError && _jsx("div", { style: { fontSize: 12, color: stateColor.danger, marginTop: 6 }, children: parseError })] })] }));
}
function CredentialDisclosure(props) {
    const { t, p, onChanged, onError, onTest, busy, testResult } = props;
    const keys = p.keys ?? [];
    const invalidCount = keys.filter((k) => !k.healthy).length;
    const allHealthy = keys.length > 0 && invalidCount === 0;
    // Default expand when no keys are configured yet (first-time setup).
    const [open, setOpen] = useState(keys.length === 0);
    const summaryText = keys.length === 0
        ? t("notConfigured")
        : allHealthy
            ? t("keyCountLabel", { n: keys.length })
            : t("keysSomeIssues", { n: invalidCount });
    const summaryColor = keys.length === 0
        ? text.tertiary
        : allHealthy
            ? text.secondary
            : stateColor.danger;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px" }, children: [_jsxs("button", { type: "button", onClick: () => setOpen(!open), style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: "inherit", color: "inherit" }, children: [_jsx("span", { style: { fontWeight: 600, fontSize: 13, color: text.primary }, children: t("credentials") }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: allHealthy ? 400 : 600, color: summaryColor }, children: summaryText }), _jsx("span", { style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", color: text.tertiary, display: "inline-flex", flex: "none" }, children: _jsx(IconChevronRightOutline14, { size: 14 }) })] })] }), open && p.keyWritable && (_jsx("div", { style: { marginTop: 2, display: "flex", flexDirection: "column", gap: 8 }, children: _jsx(CredentialList, { t: t, p: p, onChanged: onChanged, onError: onError, onTest: onTest, busy: busy, testResult: testResult }) }))] }));
}
/** Key list body with inline test button in the expanded view. */
function CredentialList(props) {
    const { t, p, onChanged, onError, onTest, busy, testResult } = props;
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");
    const [busyKey, setBusyKey] = useState(null);
    const keys = p.keys ?? [];
    const [confirmKeyId, setConfirmKeyId] = useState(null);
    const addKey = async () => {
        const value = draft.trim();
        if (!value)
            return;
        setBusyKey("add");
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
            setBusyKey(null);
        }
    };
    const removeKey = async (keyId) => {
        setBusyKey(keyId);
        try {
            await api.credentialsRemoveKey(p.name, keyId);
            setConfirmKeyId(null);
            onChanged();
        }
        catch (e) {
            onError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusyKey(null);
        }
    };
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [keys.map((k) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, minHeight: 28 }, children: [_jsx("span", { style: { fontFamily: "var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace)", color: text.primary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: k.hint }), !k.healthy && (_jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: stateColor.danger, whiteSpace: "nowrap" }, children: [_jsx("span", { style: { width: 6, height: 6, borderRadius: "50%", background: stateColor.danger } }), t("keyAuthError")] })), _jsx("div", { style: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }, children: confirmKeyId === k.id ? (_jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 4, background: surface.layer2, padding: "2px 6px", borderRadius: 6, border: `1px solid ${surface.border}` }, children: [_jsx("span", { style: { fontSize: 11, color: text.secondary }, children: t("confirmDelete") }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => void removeKey(k.id), disabled: busyKey === k.id, style: { color: stateColor.danger, padding: "0 4px", height: 20 }, children: t("deleteLabel") }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setConfirmKeyId(null), style: { padding: "0 4px", height: 20 }, children: t("cancel") })] })) : (_jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconTrashOutline16, { size: 14 }), onClick: () => setConfirmKeyId(k.id), disabled: busyKey === k.id, "aria-label": t("removeKey") })) })] }, k.id))), adding ? (_jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center", marginTop: 4 }, children: [_jsx("input", { autoFocus: true, type: "password", value: draft, onChange: (e) => setDraft(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                            void addKey(); }, placeholder: t("addKeyPlaceholder"), style: { flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${surface.border}`, background: surface.layer2, color: text.primary, fontFamily: "inherit", fontSize: 13 } }), _jsx(Button, { size: "sm", variant: "primary", onClick: () => void addKey(), disabled: busyKey === "add" || !draft.trim(), children: t("add") }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => { setAdding(false); setDraft(""); }, children: t("cancel") })] })) : (_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }, children: [_jsx(Button, { size: "sm", variant: "outline", icon: _jsx(IconPlusOutline16, { size: 14 }), onClick: () => setAdding(true), children: t("addKey") }), _jsx(Button, { size: "sm", variant: "ghost", onClick: onTest, disabled: busy || keys.length === 0, children: busy ? t("testingConnection") : t("testConnection") })] })), testResult && (_jsxs("div", { style: { fontSize: 12, color: testResult.ok ? stateColor.success : stateColor.danger, display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }, children: [_jsx(StateDot, { state: testResult.ok ? "done" : "error", size: 8 }), testResult.ok
                        ? `${t("testOk")} · ${t("testLatencySec", { s: (testResult.latencyMs / 1000).toFixed(2) })} · ${t("resultCount", { n: testResult.resultCount ?? 0 })}`
                        : `${t("testFail")}: ${testResult.error?.message ?? ""}`] }))] }));
}
/** Connection settings (Base URL / custom endpoints) as a clean Settings Row. */
function ConnectionSettingsDisclosure(props) {
    const { t, p, draftBaseUrl, setDraftBaseUrl, onBaseUrl } = props;
    const selfHosted = p.name === "searxng";
    const [open, setOpen] = useState(selfHosted);
    const isConfigured = !!p.baseUrl;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, padding: "10px 14px", borderTop: `1px solid ${surface.border}` }, children: [_jsxs("div", { role: "button", tabIndex: 0, "aria-expanded": open, onClick: () => setOpen(!open), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen(!open);
                } }, style: { display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", outline: "none" }, children: [_jsx("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: _jsx("span", { style: { fontWeight: 500, fontSize: 13, color: text.primary }, children: t("connectionSettings") }) }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { fontSize: 12, color: isConfigured ? "var(--dsw-alias-brand-primary)" : text.tertiary }, children: isConfigured ? t("connectionConfigured") : t("connectionDefault") }), _jsx("span", { style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", color: text.tertiary, display: "inline-flex", flex: "none" }, children: _jsx(IconChevronRightOutline14, { size: 14 }) })] })] }), open && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }, children: [_jsx("label", { style: { fontSize: 12, color: text.secondary }, children: t("serviceAddress") }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { value: draftBaseUrl, onChange: (e) => setDraftBaseUrl(e.target.value), onKeyDown: (e) => {
                                    if (e.key === "Enter") {
                                        e.currentTarget.blur();
                                    }
                                }, onBlur: () => {
                                    if (draftBaseUrl.trim() !== (p.baseUrl ?? ""))
                                        onBaseUrl(draftBaseUrl.trim());
                                }, placeholder: t("baseUrlPlaceholder"), style: { flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${surface.border}`, background: surface.layer2, color: text.primary, fontFamily: "inherit", fontSize: 13 } }), p.baseUrl && (_jsx(Button, { size: "sm", variant: "ghost", onClick: () => { setDraftBaseUrl(""); onBaseUrl(""); }, children: t("restoreDefaultUrl") }))] })] }))] }));
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
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const brand = PROVIDER_BRAND[p.name];
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: `
        .wt-modal-dialog {
          width: 680px !important;
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
      ` }), _jsx(Modal, { open: true, onClose: onClose, title: p.label, closeLabel: t("close"), className: "wt-modal-dialog", contentClassName: "wt-modal-content", children: _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 14, paddingBottom: 8 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 2px" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [brand && (_jsx("img", { src: brand.icon, alt: p.label, width: 24, height: 24, style: { borderRadius: 5, flexShrink: 0 } })), _jsx("span", { style: { fontSize: 13, color: text.secondary }, children: t(`capability.${p.name}`) || "" }), showPreferred && _jsx("span", { style: { fontSize: 11, color: text.tertiary, fontWeight: 500 }, children: t("preferredProviderLabel") })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [status !== "ready" && (_jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 }, children: [statusState === "hollow" ? (_jsx("span", { "aria-hidden": true, style: { width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${text.tertiary}`, flex: "none", boxSizing: "border-box" } })) : (_jsx(StateDot, { state: statusState, size: 8 })), _jsx("span", { style: { color: statusColor, fontWeight: 500, fontSize: 12 }, children: statusText })] })), _jsx(Switch, { checked: p.enabled, onChange: onToggle, label: p.enabled ? t("enabledLabel") : t("disabledLabel") })] })] }), _jsxs(SettingsGroup, { title: t("accountTitle"), dividers: "none", children: [!selfHosted && (_jsx(CredentialDisclosure, { t: t, p: p, onChanged: onConfigChanged, onError: setLocalError, onTest: onTest, busy: busy, testResult: testResult })), !selfHosted && _jsx(QuotaCard, { quota: quota, providerName: p.name, t: t, onRefresh: onRefreshQuota, embedded: true }), (selfHosted || p.baseUrl !== undefined) && (_jsx(ConnectionSettingsDisclosure, { t: t, p: p, draftBaseUrl: draftBaseUrl, setDraftBaseUrl: setDraftBaseUrl, onBaseUrl: onBaseUrl }))] }), p.options && p.name !== "searxng" && (_jsx(SettingsGroup, { title: t("searchReadTitle"), dividers: "none", children: _jsx("div", { style: { padding: "12px 14px" }, children: _jsx(ProviderPreferencesSection, { t: t, p: p, onConfigChanged: onConfigChanged }) }) })), _jsxs(SettingsGroup, { dividers: "none", children: [_jsx(SettingsRow, { title: t("advanced"), chevron: true, isLast: true, onClick: () => setAdvancedOpen(!advancedOpen) }), advancedOpen && (_jsx(DeveloperOptions, { t: t, p: p, onConfigChanged: onConfigChanged }))] }), localError && _jsx("div", { style: { color: stateColor.danger, fontSize: 12 }, children: localError })] }) })] }));
}
