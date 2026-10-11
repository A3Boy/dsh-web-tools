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
import { IconCloseOutline16, IconTrashOutline16 } from "./icons.ts";
import { text, surface, state as stateColor } from "./theme.ts";
import { CustomProviderFields } from "./CustomProviderFields.tsx";
import { api, type ProviderView, type CustomSourceTestView, type CustomProviderDraft } from "./api.ts";
import { PROTOCOL_DEFAULTS, type CustomProtocol } from "../shared/custom-provider-types.ts";
import type { TFunc } from "./WebToolsSection.tsx";
import { adoptWebToolsStyles } from "./ui/styles.ts";

export interface CustomProviderEditorProps {
  open: boolean;
  onClose: () => void;
  provider?: ProviderView;
  onSaved: (sourceId: string, addToOrder: boolean) => Promise<void> | void;
  onDeleted?: (sourceId: string) => Promise<void> | void;
  t: TFunc;
}

function initialDraftFor(p?: ProviderView): CustomProviderDraft {
  if (p && p.custom) {
    const protocol = (p.protocol as CustomProtocol) ?? "tavily-compatible";
    const defaults = PROTOCOL_DEFAULTS[protocol];
    const customCfg = p.customConfig;
    return {
      name: p.label,
      description: p.description,
      enabled: p.enabled,
      protocol,
      endpoint: {
        baseUrl: customCfg?.endpoint?.baseUrl ?? p.baseUrl ?? "",
        searchPath: customCfg?.endpoint?.searchPath ?? defaults.searchPath,
        method: customCfg?.endpoint?.method ?? defaults.method,
        encoding: customCfg?.endpoint?.encoding ?? defaults.encoding,
      },
      auth: {
        mode: (p.authMode as any) ?? "bearer",
        ...(customCfg?.auth?.headerName ? { headerName: customCfg.auth.headerName } : {}),
      },
      request: customCfg?.request ?? {
        queryField: defaults.queryField,
        limitField: defaults.limitField,
      },
      response: customCfg?.response ?? {
        ...defaults.response,
      },
    };
  }

  const defaultProtocol: CustomProtocol = "tavily-compatible";
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

export function CustomProviderEditor(props: CustomProviderEditorProps) {
  adoptWebToolsStyles();
  const { open, onClose, provider, onSaved, onDeleted, t } = props;
  const isEditing = !!provider?.custom;

  const [draft, setDraft] = useState<CustomProviderDraft>(() => initialDraftFor(provider));
  const [credentialValue, setCredentialValue] = useState("");
  const [basicPassword, setBasicPassword] = useState("");
  const [addToOrder, setAddToOrder] = useState(!isEditing);

  const [testQuery, setTestQuery] = useState("OpenAI");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<CustomSourceTestView | null>(null);

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

  if (!open) return null;

  const handleDraftChange = (patch: Partial<CustomProviderDraft>) => {
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
      const isCandidateKey = !!(credentialValue || basicPassword);
      const payload = {
        sourceId: isEditing ? provider.name : undefined,
        draft,
        credential: {
          mode: isEditing && !isCandidateKey ? ("stored" as const) : ("candidate" as const),
          value: credentialValue || undefined,
          username: credentialValue || undefined,
          password: basicPassword || undefined,
        },
        query: testQuery || "OpenAI",
      };

      const res = await api.sourceTest(payload);
      setTestResult(res);
      if (!res.ok && res.error) {
        setError(res.error.message);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
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
      let credentialPayload: unknown = undefined;
      if (draft.auth.mode === "basic") {
        if (credentialValue || basicPassword) {
          credentialPayload = {
            operation: "set",
            username: credentialValue,
            password: basicPassword,
          };
        }
      } else if (draft.auth.mode !== "none") {
        if (credentialValue) {
          credentialPayload = {
            operation: "set",
            value: credentialValue,
          };
        }
      }

      if (isEditing) {
        const res = await api.sourceUpdate(
          provider.name,
          provider.revision ?? 1,
          draft,
          credentialPayload,
        );
        await onSaved(res.id, false);
      } else {
        const res = await api.sourceCreate(draft, credentialPayload);
        await onSaved(res.id, addToOrder);
      }
      onClose();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!provider?.name) return;
    if (!window.confirm(t("confirmDeleteCustomProvider"))) return;
    setDeleting(true);
    setError("");
    try {
      await api.sourceDelete(provider.name);
      await onDeleted?.(provider.name);
      onClose();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? t("editCustomProvider") : t("addCustomProvider")}
      headless
      className="dswt-modal-dialog"
    >
      <div className="dswt-modal-body" style={{ maxHeight: "80vh", overflowY: "auto" }}>
        {/* Header */}
        <div className="dswt-provider-header" style={{ marginBottom: 16 }}>
          <div className="dswt-provider-identity">
            <div style={{ width: 32, height: 32, borderRadius: 8, background: surface.layer2, border: `1px solid ${surface.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              🔍
            </div>
            <div className="dswt-provider-title-stack">
              <h2 className="dswt-provider-name">
                {isEditing ? draft.name || t("editCustomProvider") : t("addCustomProvider")}
              </h2>
              <div className="dswt-provider-meta">
                <span>{t("customProviderTag")}</span>
              </div>
            </div>
          </div>
          <div className="dswt-provider-actions">
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="dswt-modal-close-btn"
            >
              <IconCloseOutline16 size={16} />
            </button>
          </div>
        </div>

        {/* Form Fields */}
        <CustomProviderFields
          t={t}
          draft={draft}
          credentialValue={credentialValue}
          basicPassword={basicPassword}
          hasStoredCredential={provider?.keyConfigured}
          onChange={handleDraftChange}
          onCredentialChange={setCredentialValue}
          onBasicPasswordChange={setBasicPassword}
        />

        {/* Test Section */}
        <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, background: surface.layer1, border: `1px solid ${surface.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text.primary }}>{t("testDraft")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 6,
                border: `1px solid ${surface.border}`,
                background: surface.layer2,
                color: text.primary,
                fontFamily: "inherit",
                fontSize: 13,
              }}
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="OpenAI"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleTest()}
              disabled={testing || saving}
            >
              {testing ? t("testingDraft") : t("testDraft")}
            </Button>
          </div>

          {/* Test Result Feedback */}
          {testResult && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                background: testResult.ok ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                border: `1px solid ${testResult.ok ? stateColor.success : stateColor.danger}`,
                fontSize: 12,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500, color: testResult.ok ? stateColor.success : stateColor.danger }}>
                <StateDot state={testResult.ok ? "done" : "error"} size={8} />
                <span>
                  {testResult.ok
                    ? t("testDraftSuccess", { n: testResult.resultCount ?? 0, ms: testResult.latencyMs ?? 0 })
                    : t("testDraftFailed", { msg: testResult.error?.message ?? "Error" })}
                </span>
              </div>
              {testResult.ok && testResult.results && testResult.results.length > 0 && (
                <div style={{ marginTop: 4, color: text.secondary, display: "flex", flexDirection: "column", gap: 2 }}>
                  {testResult.results.map((r, idx) => (
                    <div key={idx} style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      • {r.title || r.url}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add to order checkbox (for new source) */}
        {!isEditing && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer", fontSize: 13, color: text.secondary }}>
            <input
              type="checkbox"
              checked={addToOrder}
              onChange={(e) => setAddToOrder(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <span>{t("addToOrderImmediately")}</span>
          </label>
        )}

        {/* Global Error Banner */}
        {error && (
          <div style={{ marginTop: 12, color: stateColor.danger, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: isEditing ? "space-between" : "flex-end", alignItems: "center", marginTop: 20, paddingTop: 14, borderTop: `1px solid ${surface.border}` }}>
          {isEditing && (
            <Button
              size="sm"
              variant="ghost"
              icon={<IconTrashOutline16 size={14} />}
              onClick={() => void handleDelete()}
              disabled={deleting || saving}
              style={{ color: stateColor.danger }}
            >
              {t("deleteCustomProvider")}
            </Button>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <Button size="sm" variant="ghost" onClick={onClose} disabled={saving || deleting}>
              {t("cancel")}
            </Button>
            <Button size="sm" variant="primary" onClick={() => void handleSave()} disabled={saving || deleting}>
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
