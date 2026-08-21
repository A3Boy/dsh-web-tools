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
/** Inline quota summary line (compact, no bar). */
function QuotaInline(props) {
    const { quota, t } = props;
    const kind = quotaDisplayKind(quota);
    if (kind === "unavailable" || kind === "self_hosted")
        return null;
    if (kind === "unlimited")
        return _jsx("span", { style: { color: text.secondary, fontSize: 12 }, children: t("quotaUnlimited") });
    const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || "";
    const fraction = quotaFraction(quota);
    return (_jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: text.secondary }, children: [_jsx("span", { children: label }), fraction !== undefined && (_jsx("span", { style: { width: 60, height: 4, borderRadius: 2, background: surface.layer2, overflow: "hidden", display: "inline-block" }, children: _jsx("span", { style: { width: `${fraction * 100}%`, height: "100%", background: stateColor.success, display: "block" } }) }))] }));
}
/** Developer layer: raw provider-native parameters, read-only JSON. */
function DeveloperOptions(props) {
    const { t, p } = props;
    const [open, setOpen] = useState(false);
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
    return (_jsxs("div", { style: { borderTop: `1px solid ${surface.border}`, paddingTop: 12, marginTop: 2 }, children: [_jsxs("div", { role: "button", tabIndex: 0, "aria-expanded": open, onClick: () => setOpen(!open), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen(!open);
                } }, style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", outline: "none" }, children: [_jsx("span", { style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", color: text.tertiary, display: "inline-flex", flex: "none" }, children: _jsx(IconChevronRightOutline14, { size: 12 }) }), _jsx("span", { style: { fontWeight: 600, fontSize: 13, color: text.primary }, children: t("developerOptions") }), _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("developerOptionsHint") })] }), open && (_jsxs("div", { children: [_jsx("div", { style: { fontSize: 11, color: text.tertiary, marginTop: 10 }, children: t("developerEffective") }), _jsx("pre", { style: jsonBox, children: JSON.stringify(effective, null, 2) }), _jsx("div", { style: { fontSize: 11, color: text.tertiary, marginTop: 10 }, children: t("developerOverrides") }), hasOverrides ? (_jsx("pre", { style: jsonBox, children: JSON.stringify(overrides, null, 2) })) : (_jsx("div", { style: { fontSize: 12, color: text.tertiary, marginTop: 6 }, children: t("developerNoOverrides") }))] }))] }));
}
function CredentialDisclosure(props) {
    const { t, p, onChanged, onAfterChange, onError } = props;
    const [open, setOpen] = useState(false);
    const keys = p.keys ?? [];
    const allHealthy = keys.length > 0 && keys.every((k) => k.healthy);
    const summary = keys.length > 0
        ? `${keys.length} 把 API Key · ${allHealthy ? "均正常" : "部分异常"}`
        : t("notConfigured");
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsxs("div", { role: "button", tabIndex: 0, "aria-expanded": open, onClick: () => keys.length > 0 && setOpen(!open), onKeyDown: (e) => { if ((e.key === "Enter" || e.key === " ") && keys.length > 0) {
                    e.preventDefault();
                    setOpen(!open);
                } }, style: { display: "flex", alignItems: "center", gap: 8, cursor: keys.length > 0 ? "pointer" : "default", fontSize: 12, color: text.secondary, outline: "none" }, children: [keys.length > 0 && (_jsx("span", { style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", flex: "none", color: text.tertiary, display: "inline-flex" }, children: _jsx(IconChevronRightOutline14, { size: 12 }) })), _jsx("span", { children: summary }), keys.length > 0 && (_jsx(Button, { size: "sm", variant: "ghost", onClick: () => setOpen(!open), style: { marginLeft: "auto", fontSize: 11 }, children: open ? t("collapse") : t("manage") }))] }), open && p.keyWritable && (_jsx(CredentialList, { t: t, p: p, onChanged: onChanged, onAfterChange: onAfterChange, onError: onError }))] }));
}
/** Key list body (same as before, extracted for clarity). */
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
export function ProviderModal(props) {
    const { t, p, quota, testResult, busy, isDefault, inChain, onClose, onToggle, onBaseUrl, onTest, onRefreshQuota, onConfigChanged } = props;
    const [localError, setLocalError] = useState("");
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
          display: flex !important;
          flex-direction: column !important;
        }
        @media (max-width: 760px) {
          .wt-modal-dialog { width: calc(100vw - 24px) !important; }
        }
      ` }), _jsx(Modal, { open: true, onClose: onClose, title: p.label, closeLabel: t("close"), description: p.description, className: "wt-modal-dialog", contentClassName: "wt-modal-content", footer: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx(Button, { variant: "primary", onClick: onTest, disabled: busy, style: { flex: "none" }, children: busy ? t("testingConnection") : t("testConnection") }), testResult && (_jsxs("span", { style: { fontSize: 12, color: testResult.ok ? stateColor.success : stateColor.danger, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [_jsx(StateDot, { state: testResult.ok ? "done" : "error", size: 8 }), testResult.ok
                                    ? `${t("testOk")} · ${testResult.latencyMs}ms · ${t("resultCount", { n: testResult.resultCount ?? 0 })}`
                                    : `${t("testFail")}: ${testResult.error?.message ?? ""}`] })), _jsx("span", { style: { marginLeft: "auto", flex: "none" }, children: _jsx(Button, { variant: "ghost", onClick: onClose, children: t("close") }) })] }), children: _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [PROVIDER_BRAND[p.name] && (_jsx("img", { src: PROVIDER_BRAND[p.name].icon, alt: "", width: 32, height: 32, style: { borderRadius: 8, flex: "none" } })), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 16, color: text.primary }, children: p.label }), p.description && _jsx("div", { style: { fontSize: 12, color: text.secondary, marginTop: 1 }, children: p.description })] })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [_jsx(Switch, { checked: p.enabled, onChange: onToggle, label: p.enabled ? t("enabledLabel") : t("disabledLabel") }), _jsx("span", { style: { color: text.secondary, fontSize: 13 }, children: p.enabled ? t("enabledLabel") : t("disabledLabel") }), isDefault && (_jsx("span", { style: { color: "var(--dsw-alias-brand-primary)", fontSize: 11, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px" }, children: t("defaultProviderLabel") })), !inChain && _jsx("span", { style: { color: text.tertiary, fontSize: 12 }, children: t("notInOrder") }), _jsxs("span", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }, children: [statusState === "hollow" ? (_jsx("span", { "aria-hidden": true, style: { width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${text.tertiary}`, flex: "none", boxSizing: "border-box" } })) : (_jsx(StateDot, { state: statusState, size: 8 })), _jsx("span", { style: { color: statusColor, fontWeight: 500, fontSize: 13 }, children: statusText }), status === "ready" && _jsxs("span", { style: { color: text.tertiary, fontSize: 11 }, children: ["\u00B7 ", t("connected")] })] })] }), quota && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx(QuotaInline, { quota: quota, t: t }), _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconRefreshOutline16, { size: 12 }), onClick: () => { setRefreshing(true); onRefreshQuota(); setTimeout(() => setRefreshing(false), 600); }, disabled: refreshing, style: { fontSize: 11 }, children: t("refreshQuota") })] })), _jsx(CredentialDisclosure, { t: t, p: p, onChanged: onConfigChanged, onAfterChange: onTest, onError: setLocalError }), (selfHosted || p.baseUrl !== undefined) && (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { value: p.baseUrl ?? "", onChange: (e) => onBaseUrl(e.target.value), placeholder: t("baseUrlPlaceholder"), style: { flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${surface.border}`, background: surface.layer2, color: text.primary, fontFamily: "inherit", fontSize: 13 } }), !p.baseUrl && _jsx("span", { style: { color: text.tertiary, fontSize: 12, whiteSpace: "nowrap" }, children: t("baseUrlDefault") })] }) })), _jsx(ProviderPreferencesSection, { t: t, p: p, onConfigChanged: onConfigChanged }), _jsx(DeveloperOptions, { t: t, p: p }), localError && _jsx("div", { style: { color: stateColor.danger, fontSize: 12 }, children: localError })] }) })] }));
}
