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
import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { text, surface, state as stateColor } from "./theme.ts";
import type { TFunc } from "./WebToolsSection.tsx";
import { SegmentedControl } from "./ui/SegmentedControl.tsx";
import {
  PROTOCOL_DEFAULTS,
  accessModeOf,
  type AuthMode,
  type CustomMethod,
  type CustomEncoding,
  type CustomProtocol,
  type CustomProviderDraft,
  type CustomAccessMode,
} from "../shared/custom-provider-types.ts";
import { IconChevronRightOutline14, IconTrashOutline16 } from "./icons.ts";

export interface CustomProviderFieldsProps {
  t: TFunc;
  draft: CustomProviderDraft;
  credentialValue: string;
  basicPassword?: string;
  hasStoredCredential?: boolean;
  onChange: (patch: Partial<CustomProviderDraft>) => void;
  onCredentialChange: (value: string) => void;
  onBasicPasswordChange?: (value: string) => void;
  onValidationErrorChange?: (error: string | null) => void;
}

const inputStyle: CSSProperties = {
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

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: text.secondary,
  marginBottom: 4,
  display: "block",
};

const groupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 8,
  background: surface.layer1,
  border: `1px solid ${surface.border}`,
};

const codeBoxStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 6,
  border: `1px solid ${surface.border}`,
  background: surface.layer2,
  color: text.primary,
  fontFamily: "var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace)",
  fontSize: 12,
  lineHeight: 1.5,
  resize: "vertical",
};

const secondaryBtnStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 5,
  border: `1px solid ${surface.border}`,
  background: surface.layer1,
  color: text.primary,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

const iconBtnStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 5,
  border: `1px solid ${surface.border}`,
  background: surface.layer1,
  color: text.secondary,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export function CustomProviderFields(props: CustomProviderFieldsProps) {
  const {
    t,
    draft,
    credentialValue,
    basicPassword = "",
    hasStoredCredential = false,
    onChange,
    onCredentialChange,
    onBasicPasswordChange,
    onValidationErrorChange,
  } = props;

  const currentMode = accessModeOf(draft.protocol);
  const [advancedOpen, setAdvancedOpen] = useState(draft.protocol === "generic-json");

  const [bodyMode, setBodyMode] = useState<"standard" | "template">(() =>
    draft.request?.bodyTemplate ? "template" : "standard",
  );
  const [bodyTemplateText, setBodyTemplateText] = useState<string>(() =>
    draft.request?.bodyTemplate ? JSON.stringify(draft.request.bodyTemplate, null, 2) : "",
  );
  const [bodyJsonError, setBodyJsonError] = useState<string>("");

  const [paramsMode, setParamsMode] = useState<"standard" | "template">(() =>
    draft.request?.paramsTemplate && Object.keys(draft.request.paramsTemplate).length > 0 ? "template" : "standard",
  );

  useEffect(() => {
    if (draft.request?.bodyTemplate) {
      setBodyMode("template");
      setBodyTemplateText(JSON.stringify(draft.request.bodyTemplate, null, 2));
      setBodyJsonError("");
      onValidationErrorChange?.(null);
    } else {
      setBodyMode("standard");
      setBodyJsonError("");
      onValidationErrorChange?.(null);
    }
    if (draft.request?.paramsTemplate && Object.keys(draft.request.paramsTemplate).length > 0) {
      setParamsMode("template");
    } else {
      setParamsMode("standard");
    }
  }, [draft.protocol]);

  const updateHeaderKey = (oldKey: string, newKey: string) => {
    const cur = { ...(draft.request?.headers ?? {}) };
    const val = cur[oldKey] ?? "";
    delete cur[oldKey];
    if (newKey.trim()) {
      cur[newKey.trim()] = val;
    }
    onChange({
      request: {
        ...draft.request,
        headers: Object.keys(cur).length > 0 ? cur : undefined,
      },
    });
  };

  const updateHeaderValue = (key: string, val: string) => {
    const cur = { ...(draft.request?.headers ?? {}) };
    cur[key] = val;
    onChange({
      request: {
        ...draft.request,
        headers: cur,
      },
    });
  };

  const removeHeader = (key: string) => {
    const cur = { ...(draft.request?.headers ?? {}) };
    delete cur[key];
    onChange({
      request: {
        ...draft.request,
        headers: Object.keys(cur).length > 0 ? cur : undefined,
      },
    });
  };

  const addHeader = () => {
    const cur = { ...(draft.request?.headers ?? {}) };
    let newKey = "X-Custom-Header";
    let counter = 1;
    while (newKey in cur) {
      newKey = `X-Custom-Header-${counter++}`;
    }
    cur[newKey] = "{{apiKey}}";
    onChange({
      request: {
        ...draft.request,
        headers: cur,
      },
    });
  };

  const updateParamKey = (oldKey: string, newKey: string) => {
    const cur = { ...(draft.request?.paramsTemplate ?? {}) };
    const val = cur[oldKey] ?? "";
    delete cur[oldKey];
    if (newKey.trim()) {
      cur[newKey.trim()] = val;
    }
    onChange({
      request: {
        ...draft.request,
        paramsTemplate: Object.keys(cur).length > 0 ? cur : undefined,
      },
    });
  };

  const updateParamValue = (key: string, val: string) => {
    const cur = { ...(draft.request?.paramsTemplate ?? {}) };
    cur[key] = val;
    onChange({
      request: {
        ...draft.request,
        paramsTemplate: cur,
      },
    });
  };

  const removeParam = (key: string) => {
    const cur = { ...(draft.request?.paramsTemplate ?? {}) };
    delete cur[key];
    onChange({
      request: {
        ...draft.request,
        paramsTemplate: Object.keys(cur).length > 0 ? cur : undefined,
      },
    });
  };

  const addParam = () => {
    const cur = { ...(draft.request?.paramsTemplate ?? {}) };
    let newKey = "query";
    let counter = 1;
    while (newKey in cur) {
      newKey = `param${counter++}`;
    }
    cur[newKey] = "{{query}}";
    onChange({
      request: {
        ...draft.request,
        paramsTemplate: cur,
      },
    });
  };

  const handleAccessModeChange = (mode: CustomAccessMode) => {
    let nextProtocol: CustomProtocol = "generic-json";
    let defaultName = draft.name;

    if (mode === "compatible") {
      nextProtocol = "tavily-compatible";
      if (!draft.name || draft.name.startsWith("SearXNG") || draft.name.includes("自建")) {
        defaultName = "Tavily 兼容网关";
      }
    } else if (mode === "template") {
      nextProtocol = "searxng-json";
      if (!draft.name || draft.name.includes("Tavily") || draft.name.includes("自建")) {
        defaultName = "自建 SearXNG";
      }
    } else {
      nextProtocol = "generic-json";
      if (!draft.name) defaultName = "自建搜索服务";
    }

    const defs = PROTOCOL_DEFAULTS[nextProtocol];
    const defaultAuthMode: AuthMode =
      mode === "template" ? "none" : mode === "compatible" ? "bearer" : "api-key-header";

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

  const handleAuthModeChange = (mode: AuthMode) => {
    onChange({
      auth: {
        mode,
        ...(mode === "api-key-header" ? { headerName: draft.auth.headerName || "x-api-key" } : {}),
      },
    });
  };

  // Smart hint: suggest SearXNG template if URL matches default SearXNG patterns
  const urlSuggestsSearxng =
    currentMode !== "template" &&
    (draft.endpoint.baseUrl.includes(":8080") || draft.endpoint.baseUrl.toLowerCase().includes("searx"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 1. Access Mode Selection (Three Parallel Paths) */}
      <div>
        <label style={labelStyle}>{t("accessModeLabel")}</label>
        <SegmentedControl<CustomAccessMode>
          style={{ width: "100%" }}
          options={[
            { value: "compatible", label: t("accessModeCompatible") },
            { value: "template", label: t("accessModeTemplate") },
            { value: "custom", label: t("accessModeCustom") },
          ]}
          value={currentMode}
          onChange={handleAccessModeChange}
        />
        <div style={{ marginTop: 6, fontSize: 12, color: text.tertiary, lineHeight: 1.4 }}>
          {currentMode === "compatible" && t("compatibleProtocolDesc")}
          {currentMode === "template" && t("templateProtocolDesc")}
          {currentMode === "custom" && t("customProtocolDesc")}
        </div>
      </div>

      {/* 2. Basic Info: Name & Address */}
      <div style={groupStyle}>
        <div>
          <label style={labelStyle}>{t("customProviderName")}</label>
          <input
            style={inputStyle}
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t("customProviderNamePlaceholder")}
          />
        </div>
        <div>
          <label style={labelStyle}>{t("serviceAddress")}</label>
          <input
            style={inputStyle}
            value={draft.endpoint.baseUrl}
            onChange={(e) =>
              onChange({
                endpoint: { ...draft.endpoint, baseUrl: e.target.value },
              })
            }
            placeholder={
              currentMode === "template"
                ? "http://127.0.0.1:8080"
                : currentMode === "compatible"
                  ? "https://gateway.example.com"
                  : "https://search.example.com 或 http://192.168.1.50:8080"
            }
          />
          {urlSuggestsSearxng && (
            <button
              type="button"
              onClick={() => handleAccessModeChange("template")}
              style={{
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
              }}
            >
              💡 {t("detectedSearxngHint")}
            </button>
          )}
        </div>
        <div>
          <label style={labelStyle}>{t("customProviderDescription")}</label>
          <input
            style={inputStyle}
            value={draft.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={t("customProviderDescriptionPlaceholder")}
          />
        </div>
      </div>

      {/* 3. Authentication & Key Management */}
      <div style={groupStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text.primary }}>{t("authMode")}</div>
          {currentMode === "template" && draft.auth.mode === "none" && (
            <span style={{ fontSize: 11, color: text.tertiary }}>
              {t("searxngDefaultHint") || "默认无需密钥"}
            </span>
          )}
        </div>

        {/* Auth mode selector: full for custom mode, compact for presets */}
        {currentMode === "custom" ? (
          <SegmentedControl<AuthMode>
            style={{ width: "100%" }}
            options={[
              { value: "api-key-header", label: t("authModeApiKeyHeader") },
              { value: "bearer", label: t("authModeBearer") },
              { value: "basic", label: t("authModeBasic") },
              { value: "none", label: t("authModeNone") },
            ]}
            value={draft.auth.mode}
            onChange={handleAuthModeChange}
          />
        ) : currentMode === "template" ? (
          <SegmentedControl<AuthMode>
            style={{ width: "100%" }}
            options={[
              { value: "none", label: t("authModeNone") },
              { value: "basic", label: t("authModeBasic") },
              { value: "bearer", label: t("authModeBearer") },
            ]}
            value={draft.auth.mode}
            onChange={handleAuthModeChange}
          />
        ) : null}

        {draft.auth.mode === "api-key-header" && (
          <div>
            <label style={labelStyle}>{t("authHeaderName")}</label>
            <input
              style={inputStyle}
              value={draft.auth.headerName ?? "x-api-key"}
              onChange={(e) =>
                onChange({
                  auth: { ...draft.auth, headerName: e.target.value },
                })
              }
              placeholder="x-api-key"
            />
          </div>
        )}

        {draft.auth.mode === "basic" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>{t("username")}</label>
              <input
                style={inputStyle}
                value={credentialValue}
                onChange={(e) => onCredentialChange(e.target.value)}
                placeholder={hasStoredCredential ? t("apiKeyConfigured") : t("username")}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("password")}</label>
              <input
                style={inputStyle}
                type="password"
                value={basicPassword}
                onChange={(e) => onBasicPasswordChange?.(e.target.value)}
                placeholder={hasStoredCredential ? "••••••••" : t("password")}
              />
            </div>
          </div>
        ) : draft.auth.mode !== "none" ? (
          <div>
            <label style={labelStyle}>
              {t("credentialValue")}
              {hasStoredCredential && !credentialValue && (
                <span style={{ marginLeft: 8, color: stateColor.success, fontSize: 11 }}>
                  ({t("apiKeyConfigured")})
                </span>
              )}
            </label>
            <input
              style={inputStyle}
              type="password"
              value={credentialValue}
              onChange={(e) => onCredentialChange(e.target.value)}
              placeholder={hasStoredCredential ? t("credentialPlaceholder") + " (" + t("apiKeyConfigured") + ")" : t("credentialPlaceholder")}
            />
          </div>
        ) : null}
      </div>

      {/* 4. Advanced Interface & Mapping (Folded by default for presets, open for custom) */}
      <div style={{ border: `1px solid ${surface.border}`, borderRadius: 8, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          style={{
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
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <span>{t("advancedMappingFold")}</span>
            <span style={{ fontSize: 11, color: text.tertiary, fontWeight: 400 }}>
              {currentMode === "custom" ? t("requestSettings") : t("advancedMappingFoldDesc")}
            </span>
          </div>
          <span
            style={{
              transform: advancedOpen ? "rotate(90deg)" : "none",
              transition: "transform .15s ease",
              display: "inline-flex",
              color: text.tertiary,
            }}
          >
            <IconChevronRightOutline14 size={14} />
          </span>
        </button>

        {advancedOpen && (
          <div style={{ padding: "12px 14px", background: surface.layer2, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Request Settings */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: text.secondary, marginBottom: 8 }}>
                {t("requestSettings")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>{t("searchPath")}</label>
                  <input
                    style={inputStyle}
                    value={draft.endpoint.searchPath}
                    onChange={(e) =>
                      onChange({
                        endpoint: { ...draft.endpoint, searchPath: e.target.value },
                      })
                    }
                    placeholder="/search"
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t("httpMethod")}</label>
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={draft.endpoint.method}
                    onChange={(e) =>
                      onChange({
                        endpoint: { ...draft.endpoint, method: e.target.value as CustomMethod },
                      })
                    }
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
              </div>

              {draft.endpoint.method === "POST" && (
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>{t("encoding")}</label>
                  <SegmentedControl<CustomEncoding>
                    style={{ width: "100%" }}
                    options={[
                      { value: "json", label: t("encodingJson") },
                      { value: "form", label: t("encodingForm") },
                      { value: "query", label: t("encodingQuery") },
                    ]}
                    value={draft.endpoint.encoding}
                    onChange={(encoding) =>
                      onChange({
                        endpoint: { ...draft.endpoint, encoding },
                      })
                    }
                  />
                </div>
              )}

              {/* Request Parameters / Body / Headers */}
              {draft.endpoint.method === "POST" && draft.endpoint.encoding === "json" ? (
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>{t("requestBodyMode")}</label>
                  <SegmentedControl<"standard" | "template">
                    style={{ width: "100%" }}
                    options={[
                      { value: "standard", label: t("bodyModeStandard") },
                      { value: "template", label: t("bodyModeTemplate") },
                    ]}
                    value={bodyMode}
                    onChange={(mode) => {
                      setBodyMode(mode);
                      if (mode === "standard") {
                        setBodyJsonError("");
                        onValidationErrorChange?.(null);
                        onChange({
                          request: {
                            ...draft.request,
                            bodyTemplate: undefined,
                            queryField: draft.request?.queryField ?? "q",
                          },
                        });
                      } else {
                        const defaultTemplate = {
                          query: "{{query}}",
                          limit: "{{maxResults}}",
                        };
                        onChange({
                          request: {
                            ...draft.request,
                            bodyTemplate: draft.request?.bodyTemplate ?? defaultTemplate,
                          },
                        });
                        setBodyTemplateText(JSON.stringify(draft.request?.bodyTemplate ?? defaultTemplate, null, 2));
                        setBodyJsonError("");
                        onValidationErrorChange?.(null);
                      }
                    }}
                  />

                  {bodyMode === "standard" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                      <div>
                        <label style={labelStyle}>{t("queryField")}</label>
                        <input
                          style={inputStyle}
                          value={draft.request?.queryField ?? "q"}
                          onChange={(e) =>
                            onChange({
                              request: { ...draft.request, queryField: e.target.value },
                            })
                          }
                          placeholder="q"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>{t("limitField")}</label>
                        <input
                          style={inputStyle}
                          value={draft.request?.limitField ?? ""}
                          onChange={(e) =>
                            onChange({
                              request: { ...draft.request, limitField: e.target.value || undefined, queryField: draft.request?.queryField ?? "q" },
                            })
                          }
                          placeholder="limit"
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <label style={labelStyle}>{t("bodyTemplateLabel")}</label>
                      <textarea
                        style={codeBoxStyle}
                        rows={5}
                        value={bodyTemplateText}
                        placeholder={'{\n  "query": "{{query}}",\n  "max_results": "{{maxResults}}"\n}'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBodyTemplateText(val);
                          try {
                            const parsed = JSON.parse(val);
                            setBodyJsonError("");
                            onValidationErrorChange?.(null);
                            onChange({
                              request: {
                                ...draft.request,
                                bodyTemplate: parsed,
                              },
                            });
                          } catch {
                            const err = t("bodyTemplateInvalid");
                            setBodyJsonError(err);
                            onValidationErrorChange?.(err);
                          }
                        }}
                      />
                      {bodyJsonError ? (
                        <div style={{ fontSize: 11, color: stateColor.danger, marginTop: 4 }}>{bodyJsonError}</div>
                      ) : (
                        <div style={{ fontSize: 11, color: text.tertiary, marginTop: 4 }}>{t("bodyTemplateDesc")}</div>
                      )}
                    </div>
                  )}
                </div>
              ) : draft.endpoint.encoding === "query" ? (
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>{t("paramsMode")}</label>
                  <SegmentedControl<"standard" | "template">
                    style={{ width: "100%" }}
                    options={[
                      { value: "standard", label: t("paramsModeStandard") },
                      { value: "template", label: t("paramsModeTemplate") },
                    ]}
                    value={paramsMode}
                    onChange={(mode) => {
                      setParamsMode(mode);
                      if (mode === "standard") {
                        onChange({
                          request: {
                            ...draft.request,
                            paramsTemplate: undefined,
                            queryField: draft.request?.queryField ?? "q",
                          },
                        });
                      } else {
                        const defaultParams = {
                          q: "{{query}}",
                          limit: "{{maxResults}}",
                        };
                        onChange({
                          request: {
                            ...draft.request,
                            paramsTemplate: draft.request?.paramsTemplate ?? defaultParams,
                          },
                        });
                      }
                    }}
                  />

                  {paramsMode === "standard" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                      <div>
                        <label style={labelStyle}>{t("queryField")}</label>
                        <input
                          style={inputStyle}
                          value={draft.request?.queryField ?? "q"}
                          onChange={(e) =>
                            onChange({
                              request: { ...draft.request, queryField: e.target.value },
                            })
                          }
                          placeholder="q"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>{t("limitField")}</label>
                        <input
                          style={inputStyle}
                          value={draft.request?.limitField ?? ""}
                          onChange={(e) =>
                            onChange({
                              request: { ...draft.request, limitField: e.target.value || undefined, queryField: draft.request?.queryField ?? "q" },
                            })
                          }
                          placeholder="limit"
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {Object.entries(draft.request?.paramsTemplate ?? {}).map(([pKey, pVal], idx) => (
                          <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                            <input
                              style={inputStyle}
                              value={pKey}
                              placeholder={t("paramKeyPlaceholder")}
                              onChange={(e) => updateParamKey(pKey, e.target.value)}
                            />
                            <input
                              style={inputStyle}
                              value={pVal}
                              placeholder={t("paramValPlaceholder")}
                              onChange={(e) => updateParamValue(pKey, e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => removeParam(pKey)}
                              style={iconBtnStyle}
                              title={t("deleteLabel") || "Delete"}
                            >
                              <IconTrashOutline16 size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addParam}
                          style={secondaryBtnStyle}
                        >
                          {t("addParam")}
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: text.tertiary, marginTop: 4 }}>
                        支持 {"{{query}}"}、{"{{maxResults}}"}、{"{{apiKey}}"} 占位符
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                  <div>
                    <label style={labelStyle}>{t("queryField")}</label>
                    <input
                      style={inputStyle}
                      value={draft.request?.queryField ?? "q"}
                      onChange={(e) =>
                        onChange({
                          request: { ...draft.request, queryField: e.target.value },
                        })
                      }
                      placeholder="q"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{t("limitField")}</label>
                    <input
                      style={inputStyle}
                      value={draft.request?.limitField ?? ""}
                      onChange={(e) =>
                        onChange({
                          request: { ...draft.request, limitField: e.target.value || undefined, queryField: draft.request?.queryField ?? "q" },
                        })
                      }
                      placeholder="limit"
                    />
                  </div>
                </div>
              )}

              {/* Custom Request Headers */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${surface.border}` }}>
                <label style={labelStyle}>{t("customHeaders")}</label>
                <div style={{ fontSize: 11, color: text.tertiary, marginBottom: 8 }}>
                  {t("customHeadersDesc")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {Object.entries(draft.request?.headers ?? {}).map(([hKey, hVal], idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                      <input
                        style={inputStyle}
                        value={hKey}
                        placeholder={t("headerNamePlaceholder")}
                        onChange={(e) => updateHeaderKey(hKey, e.target.value)}
                      />
                      <input
                        style={inputStyle}
                        value={hVal}
                        placeholder={t("headerValuePlaceholder")}
                        onChange={(e) => updateHeaderValue(hKey, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeHeader(hKey)}
                        style={iconBtnStyle}
                        title={t("deleteLabel") || "Delete"}
                      >
                        <IconTrashOutline16 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addHeader}
                    style={secondaryBtnStyle}
                  >
                    {t("addHeader")}
                  </button>
                </div>
              </div>
            </div>

            {/* Response Mapping */}
            <div style={{ paddingTop: 8, borderTop: `1px solid ${surface.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: text.secondary, marginBottom: 8 }}>
                {t("responseMappingSettings")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>{t("itemsPath")}</label>
                  <input
                    style={inputStyle}
                    value={draft.response?.itemsPath ?? "results"}
                    onChange={(e) =>
                      onChange({
                        response: { ...draft.response, itemsPath: e.target.value, urlPath: draft.response?.urlPath ?? "url" },
                      })
                    }
                    placeholder="results"
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t("urlPath")}</label>
                  <input
                    style={inputStyle}
                    value={draft.response?.urlPath ?? "url"}
                    onChange={(e) =>
                      onChange({
                        response: { ...draft.response, urlPath: e.target.value, itemsPath: draft.response?.itemsPath ?? "results" },
                      })
                    }
                    placeholder="url"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                <div>
                  <label style={labelStyle}>{t("titlePath")}</label>
                  <input
                    style={inputStyle}
                    value={draft.response?.titlePath ?? ""}
                    onChange={(e) =>
                      onChange({
                        response: {
                          ...draft.response,
                          titlePath: e.target.value || undefined,
                          itemsPath: draft.response?.itemsPath ?? "results",
                          urlPath: draft.response?.urlPath ?? "url",
                        },
                      })
                    }
                    placeholder="title"
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t("snippetPath")}</label>
                  <input
                    style={inputStyle}
                    value={draft.response?.snippetPath ?? ""}
                    onChange={(e) =>
                      onChange({
                        response: {
                          ...draft.response,
                          snippetPath: e.target.value || undefined,
                          itemsPath: draft.response?.itemsPath ?? "results",
                          urlPath: draft.response?.urlPath ?? "url",
                        },
                      })
                    }
                    placeholder="content 或 snippet"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
