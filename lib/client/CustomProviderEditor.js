import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — Custom Provider Editor Modal.
 *
 * Full modal for creating and editing operator-defined custom search providers:
 *  - Full draft state kept in component memory (never writes on blur)
 *  - Testing draft before saving (calls `sources/test`)
 *  - Clear feedback on test outcome, latency, result count, and errors
 *  - Option to add to active search routing order immediately on save
 *  - Safe credential management without echoing keys
 *
 * @module
 */
import { useState, useEffect } from "react";
import { Modal, Button, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import { IconCloseOutline16, IconTrashOutline16 } from "./icons.js";
import { text, surface, state as stateColor } from "./theme.js";
import { CustomProviderFields } from "./CustomProviderFields.js";
import { api } from "./api.js";
import { PROTOCOL_DEFAULTS } from "../shared/custom-provider-types.js";
import { adoptWebToolsStyles } from "./ui/styles.js";
function initialDraftFor(p) {
    if (p && p.custom) {
        const protocol = p.protocol ?? "tavily-compatible";
        const defaults = PROTOCOL_DEFAULTS[protocol];
        return {
            name: p.label,
            description: p.description,
            enabled: p.enabled,
            protocol,
            endpoint: {
                baseUrl: p.baseUrl ?? "",
                searchPath: defaults.searchPath,
                method: defaults.method,
                encoding: defaults.encoding,
            },
            auth: {
                mode: p.authMode ?? "bearer",
            },
            request: {
                queryField: defaults.queryField,
                limitField: defaults.limitField,
            },
            response: {
                ...defaults.response,
            },
        };
    }
    const defaultProtocol = "tavily-compatible";
    const def = PROTOCOL_DEFAULTS[defaultProtocol];
    return {
        name: "",
        description: "",
        enabled: true,
        protocol: defaultProtocol,
        endpoint: {
            baseUrl: "",
            searchPath: def.searchPath,
            method: def.method,
            encoding: def.encoding,
        },
        auth: {
            mode: "bearer",
        },
        request: {
            queryField: def.queryField,
            limitField: def.limitField,
        },
        response: {
            ...def.response,
        },
    };
}
export function CustomProviderEditor(props) {
    adoptWebToolsStyles();
    const { open, onClose, provider, onSaved, onDeleted, t } = props;
    const isEditing = !!provider?.custom;
    const [draft, setDraft] = useState(() => initialDraftFor(provider));
    const [credentialValue, setCredentialValue] = useState("");
    const [basicPassword, setBasicPassword] = useState("");
    const [addToOrder, setAddToOrder] = useState(!isEditing);
    const [testQuery, setTestQuery] = useState("OpenAI");
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        setDraft(initialDraftFor(provider));
        setCredentialValue("");
        setBasicPassword("");
        setTestResult(null);
        setError("");
        setAddToOrder(!isEditing);
    }, [provider, isEditing]);
    if (!open)
        return null;
    const handleDraftChange = (patch) => {
        setDraft((prev) => ({ ...prev, ...patch }));
        setTestResult(null); // Clear test outcome on configuration change
        setError("");
    };
    const handleTest = async () => {
        if (!draft.endpoint.baseUrl.trim()) {
            setError(t("baseUrlPlaceholder"));
            return;
        }
        setTesting(true);
        setError("");
        try {
            const payload = {
                query: testQuery || "OpenAI",
            };
            if (isEditing && !credentialValue && !basicPassword) {
                // Test existing saved provider with stored credential
                payload.sourceId = provider.name;
            }
            else {
                // Test draft with candidate credential
                payload.draft = {
                    ...draft,
                    ...(credentialValue ? { credential: { values: { candidate: credentialValue } } } : {}),
                };
            }
            const res = await api.sourceTest(payload);
            setTestResult(res);
            if (!res.ok && res.error) {
                setError(res.error.message);
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setTesting(false);
        }
    };
    const handleSave = async () => {
        if (!draft.name.trim()) {
            setError(t("customProviderName") + " " + t("notConfigured"));
            return;
        }
        if (!draft.endpoint.baseUrl.trim()) {
            setError(t("serviceAddress") + " " + t("notConfigured"));
            return;
        }
        setSaving(true);
        setError("");
        try {
            let credentialPayload = undefined;
            if (draft.auth.mode === "basic") {
                if (credentialValue || basicPassword) {
                    credentialPayload = {
                        operation: "set",
                        username: credentialValue,
                        password: basicPassword,
                    };
                }
            }
            else if (draft.auth.mode !== "none") {
                if (credentialValue) {
                    credentialPayload = {
                        operation: "set",
                        value: credentialValue,
                    };
                }
            }
            if (isEditing) {
                const res = await api.sourceUpdate(provider.name, provider.revision ?? 1, draft, credentialPayload);
                await onSaved(res.id, false);
            }
            else {
                const res = await api.sourceCreate(draft, credentialPayload);
                await onSaved(res.id, addToOrder);
            }
            onClose();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setSaving(false);
        }
    };
    const handleDelete = async () => {
        if (!provider?.name)
            return;
        if (!window.confirm(t("confirmDeleteCustomProvider")))
            return;
        setDeleting(true);
        setError("");
        try {
            await api.sourceDelete(provider.name);
            await onDeleted?.(provider.name);
            onClose();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setDeleting(false);
        }
    };
    return (_jsx(Modal, { open: true, onClose: onClose, title: isEditing ? t("editCustomProvider") : t("addCustomProvider"), headless: true, className: "dswt-modal-dialog", children: _jsxs("div", { className: "dswt-modal-body", style: { maxHeight: "80vh", overflowY: "auto" }, children: [_jsxs("div", { className: "dswt-provider-header", style: { marginBottom: 16 }, children: [_jsxs("div", { className: "dswt-provider-identity", children: [_jsx("div", { style: { width: 32, height: 32, borderRadius: 8, background: surface.layer2, border: `1px solid ${surface.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }, children: "\uD83D\uDD0D" }), _jsxs("div", { className: "dswt-provider-title-stack", children: [_jsx("h2", { className: "dswt-provider-name", children: isEditing ? draft.name || t("editCustomProvider") : t("addCustomProvider") }), _jsx("div", { className: "dswt-provider-meta", children: _jsx("span", { children: t("customProviderTag") }) })] })] }), _jsx("div", { className: "dswt-provider-actions", children: _jsx("button", { type: "button", onClick: onClose, "aria-label": t("close"), className: "dswt-modal-close-btn", children: _jsx(IconCloseOutline16, { size: 16 }) }) })] }), _jsx(CustomProviderFields, { t: t, draft: draft, credentialValue: credentialValue, basicPassword: basicPassword, hasStoredCredential: provider?.keyConfigured, onChange: handleDraftChange, onCredentialChange: setCredentialValue, onBasicPasswordChange: setBasicPassword }), _jsxs("div", { style: { marginTop: 16, padding: "12px 14px", borderRadius: 8, background: surface.layer1, border: `1px solid ${surface.border}`, display: "flex", flexDirection: "column", gap: 10 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: text.primary }, children: t("testDraft") }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("input", { style: {
                                        flex: 1,
                                        padding: "6px 10px",
                                        borderRadius: 6,
                                        border: `1px solid ${surface.border}`,
                                        background: surface.layer2,
                                        color: text.primary,
                                        fontFamily: "inherit",
                                        fontSize: 13,
                                    }, value: testQuery, onChange: (e) => setTestQuery(e.target.value), placeholder: "OpenAI" }), _jsx(Button, { size: "sm", variant: "outline", onClick: () => void handleTest(), disabled: testing || saving, children: testing ? t("testingDraft") : t("testDraft") })] }), testResult && (_jsxs("div", { style: {
                                padding: "8px 12px",
                                borderRadius: 6,
                                background: testResult.ok ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                                border: `1px solid ${testResult.ok ? stateColor.success : stateColor.danger}`,
                                fontSize: 12,
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                            }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, fontWeight: 500, color: testResult.ok ? stateColor.success : stateColor.danger }, children: [_jsx(StateDot, { state: testResult.ok ? "done" : "error", size: 8 }), _jsx("span", { children: testResult.ok
                                                ? t("testDraftSuccess", { n: testResult.resultCount ?? 0, ms: testResult.latencyMs ?? 0 })
                                                : t("testDraftFailed", { msg: testResult.error?.message ?? "Error" }) })] }), testResult.ok && testResult.results && testResult.results.length > 0 && (_jsx("div", { style: { marginTop: 4, color: text.secondary, display: "flex", flexDirection: "column", gap: 2 }, children: testResult.results.map((r, idx) => (_jsxs("div", { style: { textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }, children: ["\u2022 ", r.title || r.url] }, idx))) }))] }))] }), !isEditing && (_jsxs("label", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer", fontSize: 13, color: text.secondary }, children: [_jsx("input", { type: "checkbox", checked: addToOrder, onChange: (e) => setAddToOrder(e.target.checked), style: { cursor: "pointer" } }), _jsx("span", { children: t("addToOrderImmediately") })] })), error && (_jsx("div", { style: { marginTop: 12, color: stateColor.danger, fontSize: 13 }, children: error })), _jsxs("div", { style: { display: "flex", justifyContent: isEditing ? "space-between" : "flex-end", alignItems: "center", marginTop: 20, paddingTop: 14, borderTop: `1px solid ${surface.border}` }, children: [isEditing && (_jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(IconTrashOutline16, { size: 14 }), onClick: () => void handleDelete(), disabled: deleting || saving, style: { color: stateColor.danger }, children: t("deleteCustomProvider") })), _jsxs("div", { style: { display: "flex", gap: 10 }, children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: onClose, disabled: saving || deleting, children: t("cancel") }), _jsx(Button, { size: "sm", variant: "primary", onClick: () => void handleSave(), disabled: saving || deleting, children: saving ? t("saving") : t("save") })] })] })] }) }));
}
