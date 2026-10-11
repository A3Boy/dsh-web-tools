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
import type { CSSProperties } from "react";
import { text, surface, state as stateColor } from "./theme.ts";
import type { TFunc } from "./WebToolsSection.tsx";
import { SegmentedControl } from "./ui/SegmentedControl.tsx";
import {
  PROTOCOL_DEFAULTS,
  type AuthMode,
  type CustomMethod,
  type CustomEncoding,
  type CustomProtocol,
  type CustomProviderDraft,
} from "../shared/custom-provider-types.ts";
import { IconChevronRightOutline14 } from "./icons.ts";

export interface CustomProviderFieldsProps {
  t: TFunc;
  draft: CustomProviderDraft;
  credentialValue: string;
  basicPassword?: string;
  hasStoredCredential?: boolean;
  onChange: (patch: Partial<CustomProviderDraft>) => void;
  onCredentialChange: (value: string) => void;
  onBasicPasswordChange?: (value: string) => void;
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
  } = props;

  const [advancedOpen, setAdvancedOpen] = useState(draft.protocol === "generic-json");

  const handleProtocolChange = (protocol: CustomProtocol) => {
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

  const handleAuthModeChange = (mode: AuthMode) => {
    onChange({
      auth: {
        mode,
        ...(mode === "api-key-header" ? { headerName: draft.auth.headerName || "x-api-key" } : {}),
      },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 1. Protocol Picker */}
      <div>
        <label style={labelStyle}>{t("customProtocol")}</label>
        <SegmentedControl<CustomProtocol>
          style={{ width: "100%" }}
          options={[
            { value: "tavily-compatible", label: t("protocolTavily") },
            { value: "searxng-json", label: t("protocolSearxng") },
            { value: "generic-json", label: t("protocolGeneric") },
          ]}
          value={draft.protocol}
          onChange={handleProtocolChange}
        />
      </div>

      {/* 2. Basic Info: Name & Description */}
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
          <label style={labelStyle}>{t("customProviderDescription")}</label>
          <input
            style={inputStyle}
            value={draft.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={t("customProviderDescriptionPlaceholder")}
          />
        </div>
      </div>

      {/* 3. Endpoint Configuration */}
      <div style={groupStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: text.primary }}>{t("serviceAddress")}</div>
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
            placeholder="https://search.example.com"
          />
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
          <div>
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
      </div>

      {/* 4. Authentication */}
      <div style={groupStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: text.primary }}>{t("authMode")}</div>
        <SegmentedControl<AuthMode>
          style={{ width: "100%" }}
          options={[
            { value: "bearer", label: t("authModeBearer") },
            { value: "api-key-header", label: t("authModeApiKeyHeader") },
            { value: "basic", label: t("authModeBasic") },
            { value: "none", label: t("authModeNone") },
          ]}
          value={draft.auth.mode}
          onChange={handleAuthModeChange}
        />

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

      {/* 5. Request & Response Mapping (Foldable / Generic JSON) */}
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
          <span>{t("responseMappingSettings")}</span>
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
          <div style={{ padding: "12px 14px", background: surface.layer2, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                  placeholder="snippet"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>{t("publishedAtPath")}</label>
                <input
                  style={inputStyle}
                  value={draft.response?.publishedAtPath ?? ""}
                  onChange={(e) =>
                    onChange({
                      response: {
                        ...draft.response,
                        publishedAtPath: e.target.value || undefined,
                        itemsPath: draft.response?.itemsPath ?? "results",
                        urlPath: draft.response?.urlPath ?? "url",
                      },
                    })
                  }
                  placeholder="publishedDate"
                />
              </div>
              <div>
                <label style={labelStyle}>{t("answerPath")}</label>
                <input
                  style={inputStyle}
                  value={draft.response?.answerPath ?? ""}
                  onChange={(e) =>
                    onChange({
                      response: {
                        ...draft.response,
                        answerPath: e.target.value || undefined,
                        itemsPath: draft.response?.itemsPath ?? "results",
                        urlPath: draft.response?.urlPath ?? "url",
                      },
                    })
                  }
                  placeholder="answer"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
