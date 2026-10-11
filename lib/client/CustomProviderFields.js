import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — Custom Provider configuration fields component.
 *
 * Provides organized, declarative inputs for:
 *  - Protocol selection (Tavily, SearXNG, Generic JSON)
 *  - Endpoint & transport (Base URL, search path, method, encoding)
 *  - Authentication & credentials (None, Bearer, API Key Header, Basic)
 *  - Request parameters & mapping
 *  - Response JSON field paths
 *
 * @module
 */
import { useState } from "react";
import { text, surface, state as stateColor } from "./theme.js";
import { SegmentedControl } from "./ui/SegmentedControl.js";
import { PROTOCOL_DEFAULTS, } from "../shared/custom-provider-types.js";
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
    const [advancedOpen, setAdvancedOpen] = useState(draft.protocol === "generic-json");
    const handleProtocolChange = (protocol) => {
        const defaults = PROTOCOL_DEFAULTS[protocol];
        onChange({
            protocol,
            endpoint: {
                ...draft.endpoint,
                method: defaults.method,
                encoding: defaults.encoding,
                searchPath: defaults.searchPath,
            },
            request: {
                queryField: defaults.queryField,
                ...(defaults.limitField ? { limitField: defaults.limitField } : {}),
            },
            response: {
                ...defaults.response,
            },
        });
        if (protocol === "generic-json") {
            setAdvancedOpen(true);
        }
    };
    const handleAuthModeChange = (mode) => {
        onChange({
            auth: {
                mode,
                ...(mode === "api-key-header" ? { headerName: draft.auth.headerName || "x-api-key" } : {}),
            },
        });
    };
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("customProtocol") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                            { value: "tavily-compatible", label: t("protocolTavily") },
                            { value: "searxng-json", label: t("protocolSearxng") },
                            { value: "generic-json", label: t("protocolGeneric") },
                        ], value: draft.protocol, onChange: handleProtocolChange })] }), _jsxs("div", { style: groupStyle, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("customProviderName") }), _jsx("input", { style: inputStyle, value: draft.name, onChange: (e) => onChange({ name: e.target.value }), placeholder: t("customProviderNamePlaceholder") })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("customProviderDescription") }), _jsx("input", { style: inputStyle, value: draft.description ?? "", onChange: (e) => onChange({ description: e.target.value }), placeholder: t("customProviderDescriptionPlaceholder") })] })] }), _jsxs("div", { style: groupStyle, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: text.primary }, children: t("serviceAddress") }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("serviceAddress") }), _jsx("input", { style: inputStyle, value: draft.endpoint.baseUrl, onChange: (e) => onChange({
                                    endpoint: { ...draft.endpoint, baseUrl: e.target.value },
                                }), placeholder: "https://search.example.com" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("searchPath") }), _jsx("input", { style: inputStyle, value: draft.endpoint.searchPath, onChange: (e) => onChange({
                                            endpoint: { ...draft.endpoint, searchPath: e.target.value },
                                        }), placeholder: "/search" })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("httpMethod") }), _jsxs("select", { style: { ...inputStyle, cursor: "pointer" }, value: draft.endpoint.method, onChange: (e) => onChange({
                                            endpoint: { ...draft.endpoint, method: e.target.value },
                                        }), children: [_jsx("option", { value: "GET", children: "GET" }), _jsx("option", { value: "POST", children: "POST" })] })] })] }), draft.endpoint.method === "POST" && (_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("encoding") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                                    { value: "json", label: t("encodingJson") },
                                    { value: "form", label: t("encodingForm") },
                                    { value: "query", label: t("encodingQuery") },
                                ], value: draft.endpoint.encoding, onChange: (encoding) => onChange({
                                    endpoint: { ...draft.endpoint, encoding },
                                }) })] }))] }), _jsxs("div", { style: groupStyle, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: text.primary }, children: t("authMode") }), _jsx(SegmentedControl, { style: { width: "100%" }, options: [
                            { value: "bearer", label: t("authModeBearer") },
                            { value: "api-key-header", label: t("authModeApiKeyHeader") },
                            { value: "basic", label: t("authModeBasic") },
                            { value: "none", label: t("authModeNone") },
                        ], value: draft.auth.mode, onChange: handleAuthModeChange }), draft.auth.mode === "api-key-header" && (_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("authHeaderName") }), _jsx("input", { style: inputStyle, value: draft.auth.headerName ?? "x-api-key", onChange: (e) => onChange({
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
                        }, children: [_jsx("span", { children: t("responseMappingSettings") }), _jsx("span", { style: {
                                    transform: advancedOpen ? "rotate(90deg)" : "none",
                                    transition: "transform .15s ease",
                                    display: "inline-flex",
                                    color: text.tertiary,
                                }, children: _jsx(IconChevronRightOutline14, { size: 14 }) })] }), advancedOpen && (_jsxs("div", { style: { padding: "12px 14px", background: surface.layer2, display: "flex", flexDirection: "column", gap: 12 }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("queryField") }), _jsx("input", { style: inputStyle, value: draft.request?.queryField ?? "q", onChange: (e) => onChange({
                                                    request: { ...draft.request, queryField: e.target.value },
                                                }), placeholder: "q" })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("limitField") }), _jsx("input", { style: inputStyle, value: draft.request?.limitField ?? "", onChange: (e) => onChange({
                                                    request: { ...draft.request, limitField: e.target.value || undefined, queryField: draft.request?.queryField ?? "q" },
                                                }), placeholder: "limit" })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("itemsPath") }), _jsx("input", { style: inputStyle, value: draft.response?.itemsPath ?? "results", onChange: (e) => onChange({
                                                    response: { ...draft.response, itemsPath: e.target.value, urlPath: draft.response?.urlPath ?? "url" },
                                                }), placeholder: "results" })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("urlPath") }), _jsx("input", { style: inputStyle, value: draft.response?.urlPath ?? "url", onChange: (e) => onChange({
                                                    response: { ...draft.response, urlPath: e.target.value, itemsPath: draft.response?.itemsPath ?? "results" },
                                                }), placeholder: "url" })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("titlePath") }), _jsx("input", { style: inputStyle, value: draft.response?.titlePath ?? "", onChange: (e) => onChange({
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
                                                }), placeholder: "snippet" })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("publishedAtPath") }), _jsx("input", { style: inputStyle, value: draft.response?.publishedAtPath ?? "", onChange: (e) => onChange({
                                                    response: {
                                                        ...draft.response,
                                                        publishedAtPath: e.target.value || undefined,
                                                        itemsPath: draft.response?.itemsPath ?? "results",
                                                        urlPath: draft.response?.urlPath ?? "url",
                                                    },
                                                }), placeholder: "publishedDate" })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: t("answerPath") }), _jsx("input", { style: inputStyle, value: draft.response?.answerPath ?? "", onChange: (e) => onChange({
                                                    response: {
                                                        ...draft.response,
                                                        answerPath: e.target.value || undefined,
                                                        itemsPath: draft.response?.itemsPath ?? "results",
                                                        urlPath: draft.response?.urlPath ?? "url",
                                                    },
                                                }), placeholder: "answer" })] })] })] }))] })] }));
}
