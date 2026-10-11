import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — Custom Provider configuration fields component.
 *
 * Implements three clean access paths:
 *  1. Compatible API (e.g. Tavily Compatible) — reuses native logic, no mapping needed.
 *  2. Protocol Template (e.g. SearXNG JSON) — preconfigures request and response mappings.
 *  3. Custom JSON API (Generic JSON) — flexible request/response mapping for arbitrary in-house APIs.
 *
 * All technical mapping fields are neatly folded by default for preset modes.
 *
 * @module
 */
import { useState } from "react";
import { text, surface, state as stateColor } from "./theme.js";
import { SegmentedControl } from "./ui/SegmentedControl.js";
import { PROTOCOL_DEFAULTS, accessModeOf, } from "../shared/custom-provider-types.js";
import { IconChevronRightOutline14 } from "./icons.js";
const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 10px",
    borderRadius: 6,
    border: `1px solid ${surface.border}`,
    background: surface.layer2,
    color: text.primary,
    fontFamily: "inherit",
    fontSize: 13,
};
const labelStyle = {
    fontSize: 12,
    fontWeight: 500,
    color: text.secondary,
    marginBottom: 4,
    display: "block",
};
const groupStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    background: surface.layer1,
    border: `1px solid ${surface.border}`,
};
export function CustomProviderFields(props) {
    const { t, draft, credentialValue, basicPassword = "", hasStoredCredential = false, onChange, onCredentialChange, onBasicPasswordChange, } = props;
    const currentMode = accessModeOf(draft.protocol);
    const [advancedOpen, setAdvancedOpen] = useState(draft.protocol === "generic-json");
    const handleAccessModeChange = (mode) => {
        let nextProtocol = "generic-json";
        let defaultName = draft.name;
        if (mode === "compatible") {
            nextProtocol = "tavily-compatible";
            if (!draft.name || draft.name.startsWith("SearXNG") || draft.name.includes("自建")) {
                defaultName = "Tavily 兼容网关";
            }
        }
        else if (mode === "template") {
            nextProtocol = "searxng-json";
            if (!draft.name || draft.name.includes("Tavily") || draft.name.includes("自建")) {
                defaultName = "自建 SearXNG";
            }
        }
        else {
            nextProtocol = "generic-json";
            if (!draft.name)
                defaultName = "自建搜索服务";
        }
        const defs = PROTOCOL_DEFAULTS[nextProtocol];
        const defaultAuthMode = mode === "template" ? "none" : mode === "compatible" ? "bearer" : "api-key-header";
        onChange({
            protocol: nextProtocol,
            name: defaultName,
            endpoint: {
                baseUrl: draft.endpoint.baseUrl,
                searchPath: defs.searchPath,
                method: defs.method,
                encoding: defs.encoding,
            },
            auth: {
                mode: defaultAuthMode,
                ...(defaultAuthMode === "api-key-header" ? { headerName: "x-api-key" } : {}),
            },
            request: {
                queryField: defs.queryField,
                ...(defs.limitField ? { limitField: defs.limitField } : {}),
                ...(defs.staticParams ? { staticParams: defs.staticParams } : {}),
            },
            response: {
                ...defs.response,
            },
        });
        setAdvancedOpen(mode === "custom");
    };
    const handleAuthModeChange = (mode) => {
        onChange({
            auth: {
                mode,
                ...(mode === "api-key-header" ? { headerName: draft.auth.headerName || "x-api-key" } : {}),
            },
        });
    };
    // Smart hint: suggest SearXNG template if URL matches default SearXNG patterns
    const urlSuggestsSearxng = currentMode !== "template" &&
        (draft.endpoint.baseUrl.includes(":8080") || draft.endpoint.baseUrl.toLowerCase().includes("searx"));
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("accessModeLabel") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                            { value: "compatible", label: t("accessModeCompatible") },
                            { value: "template", label: t("accessModeTemplate") },
                            { value: "custom", label: t("accessModeCustom") },
                        ], value: currentMode, onChange: handleAccessModeChange }), _jsxs("div", { style: { marginTop: 6, fontSize: 12, color: text.tertiary, lineHeight: 1.4 }, children: [currentMode === "compatible" && t("compatibleProtocolDesc"), currentMode === "template" && t("templateProtocolDesc"), currentMode === "custom" && t("customProtocolDesc")] })] }), _jsxs("div", { style: groupStyle, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("customProviderName") }), _jsx("input", { style: inputStyle, value: draft.name, onChange: (e) => onChange({ name: e.target.value }), placeholder: t("customProviderNamePlaceholder") })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("serviceAddress") }), _jsx("input", { style: inputStyle, value: draft.endpoint.baseUrl, onChange: (e) => onChange({
                                    endpoint: { ...draft.endpoint, baseUrl: e.target.value },
                                }), placeholder: currentMode === "template"
                                    ? "http://127.0.0.1:8080"
                                    : currentMode === "compatible"
                                        ? "https://gateway.example.com"
                                        : "https://search.example.com 或 http://192.168.1.50:8080" }), urlSuggestsSearxng && (_jsxs("button", { type: "button", onClick: () => handleAccessModeChange("template"), style: {
                                    marginTop: 6,
                                    padding: "3px 8px",
                                    borderRadius: 4,
                                    border: "none",
                                    background: "rgba(59, 130, 246, 0.1)",
                                    color: "var(--dsw-alias-brand-primary, #3b82f6)",
                                    fontSize: 11,
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                }, children: ["\uD83D\uDCA1 ", t("detectedSearxngHint")] }))] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("customProviderDescription") }), _jsx("input", { style: inputStyle, value: draft.description ?? "", onChange: (e) => onChange({ description: e.target.value }), placeholder: t("customProviderDescriptionPlaceholder") })] })] }), _jsxs("div", { style: groupStyle, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: text.primary }, children: t("authMode") }), currentMode === "template" && draft.auth.mode === "none" && (_jsx("span", { style: { fontSize: 11, color: text.tertiary }, children: t("searxngDefaultHint") || "默认无需密钥" }))] }), currentMode === "custom" ? (_jsx(SegmentedControl, { style: { width: "100%" }, options: [
                            { value: "api-key-header", label: t("authModeApiKeyHeader") },
                            { value: "bearer", label: t("authModeBearer") },
                            { value: "basic", label: t("authModeBasic") },
                            { value: "none", label: t("authModeNone") },
                        ], value: draft.auth.mode, onChange: handleAuthModeChange })) : currentMode === "template" ? (_jsx(SegmentedControl, { style: { width: "100%" }, options: [
                            { value: "none", label: t("authModeNone") },
                            { value: "basic", label: t("authModeBasic") },
                            { value: "bearer", label: t("authModeBearer") },
                        ], value: draft.auth.mode, onChange: handleAuthModeChange })) : null, draft.auth.mode === "api-key-header" && (_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("authHeaderName") }), _jsx("input", { style: inputStyle, value: draft.auth.headerName ?? "x-api-key", onChange: (e) => onChange({
                                    auth: { ...draft.auth, headerName: e.target.value },
                                }), placeholder: "x-api-key" })] })), draft.auth.mode === "basic" ? (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("username") }), _jsx("input", { style: inputStyle, value: credentialValue, onChange: (e) => onCredentialChange(e.target.value), placeholder: hasStoredCredential ? t("apiKeyConfigured") : t("username") })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("password") }), _jsx("input", { style: inputStyle, type: "password", value: basicPassword, onChange: (e) => onBasicPasswordChange?.(e.target.value), placeholder: hasStoredCredential ? "••••••••" : t("password") })] })] })) : draft.auth.mode !== "none" ? (_jsxs("div", { children: [_jsxs("label", { style: labelStyle, children: [t("credentialValue"), hasStoredCredential && !credentialValue && (_jsxs("span", { style: { marginLeft: 8, color: stateColor.success, fontSize: 11 }, children: ["(", t("apiKeyConfigured"), ")"] }))] }), _jsx("input", { style: inputStyle, type: "password", value: credentialValue, onChange: (e) => onCredentialChange(e.target.value), placeholder: hasStoredCredential ? t("credentialPlaceholder") + " (" + t("apiKeyConfigured") + ")" : t("credentialPlaceholder") })] })) : null] }), _jsxs("div", { style: { border: `1px solid ${surface.border}`, borderRadius: 8, overflow: "hidden" }, children: [_jsxs("button", { type: "button", onClick: () => setAdvancedOpen(!advancedOpen), style: {
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            background: surface.layer1,
                            border: "none",
                            color: text.primary,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }, children: [_jsx("span", { children: t("advancedMappingFold") }), _jsx("span", { style: { fontSize: 11, color: text.tertiary, fontWeight: 400 }, children: currentMode === "custom" ? t("requestSettings") : t("advancedMappingFoldDesc") })] }), _jsx("span", { style: {
                                    transform: advancedOpen ? "rotate(90deg)" : "none",
                                    transition: "transform .15s ease",
                                    display: "inline-flex",
                                    color: text.tertiary,
                                }, children: _jsx(IconChevronRightOutline14, { size: 14 }) })] }), advancedOpen && (_jsxs("div", { style: { padding: "12px 14px", background: surface.layer2, display: "flex", flexDirection: "column", gap: 14 }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, color: text.secondary, marginBottom: 8 }, children: t("requestSettings") }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("searchPath") }), _jsx("input", { style: inputStyle, value: draft.endpoint.searchPath, onChange: (e) => onChange({
                                                            endpoint: { ...draft.endpoint, searchPath: e.target.value },
                                                        }), placeholder: "/search" })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("httpMethod") }), _jsxs("select", { style: { ...inputStyle, cursor: "pointer" }, value: draft.endpoint.method, onChange: (e) => onChange({
                                                            endpoint: { ...draft.endpoint, method: e.target.value },
                                                        }), children: [_jsx("option", { value: "GET", children: "GET" }), _jsx("option", { value: "POST", children: "POST" })] })] })] }), draft.endpoint.method === "POST" && (_jsxs("div", { style: { marginTop: 8 }, children: [_jsx("label", { style: labelStyle, children: t("encoding") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                                                    { value: "json", label: t("encodingJson") },
                                                    { value: "form", label: t("encodingForm") },
                                                    { value: "query", label: t("encodingQuery") },
                                                ], value: draft.endpoint.encoding, onChange: (encoding) => onChange({
                                                    endpoint: { ...draft.endpoint, encoding },
                                                }) })] })), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("queryField") }), _jsx("input", { style: inputStyle, value: draft.request?.queryField ?? "q", onChange: (e) => onChange({
                                                            request: { ...draft.request, queryField: e.target.value },
                                                        }), placeholder: "q" })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("limitField") }), _jsx("input", { style: inputStyle, value: draft.request?.limitField ?? "", onChange: (e) => onChange({
                                                            request: { ...draft.request, limitField: e.target.value || undefined, queryField: draft.request?.queryField ?? "q" },
                                                        }), placeholder: "limit" })] })] })] }), _jsxs("div", { style: { paddingTop: 8, borderTop: `1px solid ${surface.border}` }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, color: text.secondary, marginBottom: 8 }, children: t("responseMappingSettings") }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("itemsPath") }), _jsx("input", { style: inputStyle, value: draft.response?.itemsPath ?? "results", onChange: (e) => onChange({
                                                            response: { ...draft.response, itemsPath: e.target.value, urlPath: draft.response?.urlPath ?? "url" },
                                                        }), placeholder: "results" })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("urlPath") }), _jsx("input", { style: inputStyle, value: draft.response?.urlPath ?? "url", onChange: (e) => onChange({
                                                            response: { ...draft.response, urlPath: e.target.value, itemsPath: draft.response?.itemsPath ?? "results" },
                                                        }), placeholder: "url" })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("titlePath") }), _jsx("input", { style: inputStyle, value: draft.response?.titlePath ?? "", onChange: (e) => onChange({
                                                            response: {
                                                                ...draft.response,
                                                                titlePath: e.target.value || undefined,
                                                                itemsPath: draft.response?.itemsPath ?? "results",
                                                                urlPath: draft.response?.urlPath ?? "url",
                                                            },
                                                        }), placeholder: "title" })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("snippetPath") }), _jsx("input", { style: inputStyle, value: draft.response?.snippetPath ?? "", onChange: (e) => onChange({
                                                            response: {
                                                                ...draft.response,
                                                                snippetPath: e.target.value || undefined,
                                                                itemsPath: draft.response?.itemsPath ?? "results",
                                                                urlPath: draft.response?.urlPath ?? "url",
                                                            },
                                                        }), placeholder: "content \u6216 snippet" })] })] })] })] }))] })] }));
}
