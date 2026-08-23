/**
 * dsh-web-tools — provider detail dialog (Modal).
 *
 * Compact, fixed-height layout: header/footer are sticky, body scrolls.
 * Overview (status + quota) compressed into one line; credentials collapsed
 * by default.
 * @module
 */
import { useState, useRef, type CSSProperties } from "react";
import { Button, IconChevronRightOutline14, IconPlusOutline16, IconTrashOutline16, IconCloseOutline16, IconSettingsOutline16, Modal, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import { api, type ProviderView, type QuotaView, type TestProviderView } from "./api.ts";
import { text, surface, state as stateColor } from "./theme.ts";
import { Switch, type TFunc } from "./WebToolsSection.tsx";
import { providerStatusOf, testOutcomeStatus, type ProviderStatus } from "./logic.ts";
import { ProviderPreferencesSection } from "./provider-preferences/ProviderPreferencesSection.tsx";
import { PROVIDER_BRAND } from "./brand.ts";
import { SettingsGroup, SettingsRow } from "./ui/SettingsGroup.tsx";
import { QuotaCard } from "./ui/QuotaInline.tsx";
import { adoptWebToolsStyles } from "./ui/styles.ts";

interface Props {
  t: TFunc;
  p: ProviderView;
  quota?: QuotaView;
  testResult?: TestProviderView;
  busy: boolean;
  /** Show the "首选" badge — only when the routing policy is "ordered". */
  showPreferred: boolean;
  inChain: boolean;
  onClose: () => void;
  onToggle: (enabled: boolean) => void;
  onBaseUrl: (url: string) => void;
  onTest: () => Promise<void>;
  onRefreshQuota: () => void;
  onConfigChanged: () => Promise<void> | void;
}

/** Developer layer: raw provider-native parameters. Effective values are
 *  read-only; overrides are editable as JSON (parsed + saved through the
 *  Host's sanitize gate). */
function DeveloperOptions(props: { t: TFunc; p: ProviderView; onConfigChanged: () => void }) {
  const { t, p, onConfigChanged } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [parseError, setParseError] = useState("");
  const [saving, setSaving] = useState(false);
  const effective = p.options?.effective ?? {};
  const overrides = p.options?.overrides ?? {};
  const hasOverrides = Object.keys(overrides).length > 0;

  const jsonBox: CSSProperties = {
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setParseError(t("developerParseError"));
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      parsed = {};
    }
    setSaving(true);
    setParseError("");
    try {
      await api.providerOptionsSet(p.name, parsed as Record<string, unknown>);
      onConfigChanged();
      setEditing(false);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 500, fontSize: 13, color: text.primary }}>{t("developerOptions")}</span>
          <span style={{ fontSize: 11, color: text.tertiary }}>{t("developerOptionsHint")}</span>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: text.tertiary, marginTop: 4 }}>{t("developerEffective")}</div>
        <pre style={jsonBox}>{JSON.stringify(effective, null, 2)}</pre>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: text.tertiary }}>{t("developerOverrides")}</span>
          <span style={{ marginLeft: "auto" }}>
            {editing ? (
              <>
                <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>{t("developerEditCancel")}</Button>
                <Button size="sm" variant="primary" onClick={() => void saveEdit()} disabled={saving}>{t("developerEditSave")}</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={startEdit}>{t("developerEdit")}</Button>
            )}
          </span>
        </div>
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              spellCheck={false}
              style={{
                ...jsonBox,
                resize: "vertical",
                outline: "none",
                color: text.primary,
              }}
            />
            <div style={{ fontSize: 11, color: text.tertiary, marginTop: 4 }}>{t("developerEditHint")}</div>
          </>
        ) : hasOverrides ? (
          <pre style={jsonBox}>{JSON.stringify(overrides, null, 2)}</pre>
        ) : (
          <div style={{ fontSize: 12, color: text.tertiary, marginTop: 6 }}>{t("developerNoOverrides")}</div>
        )}
        {parseError && <div style={{ fontSize: 12, color: stateColor.danger, marginTop: 6 }}>{parseError}</div>}
      </div>
    </div>
  );
}

function IconKey() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6.5" r="3.5" />
      <path d="M8.5 9l5 5M11.5 12l1.5 1.5M13.5 10l1 1" />
    </svg>
  );
}

function IconConsole() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M5 6.5l2 1.5-2 1.5M9 9.5h2" />
    </svg>
  );
}

function CredentialDisclosure(props: {
  t: TFunc;
  p: ProviderView;
  onChanged: () => void;
  onError: (msg: string) => void;
  onTest: () => Promise<void>;
  busy: boolean;
  testResult?: TestProviderView;
}) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <button
        type="button"
        className="dswt-settings-row clickable"
        onClick={() => setOpen(!open)}
      >
        <div className="dswt-row-icon"><IconKey /></div>
        <div className="dswt-row-main">
          <div className="dswt-row-title">{t("credentials")}</div>
        </div>
        <div className="dswt-row-trailing">
          <span style={{ fontSize: 13, fontWeight: allHealthy ? 400 : 500, color: summaryColor }}>{summaryText}</span>
        </div>
        <div className="dswt-row-chevron">
          <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", display: "inline-flex" }}>
            <IconChevronRightOutline14 size={14} />
          </span>
        </div>
      </button>
      {open && p.keyWritable && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <CredentialList t={t} p={p} onChanged={onChanged} onError={onError} onTest={onTest} busy={busy} testResult={testResult} />
        </div>
      )}
    </div>
  );
}

/** Key list body with inline test button in the expanded view. */
function CredentialList(props: {
  t: TFunc;
  p: ProviderView;
  onChanged: () => void;
  onError: (msg: string) => void;
  onTest: () => Promise<void>;
  busy: boolean;
  testResult?: TestProviderView;
}) {
  const { t, p, onChanged, onError, onTest, busy, testResult } = props;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const keys = p.keys ?? [];

  const [confirmKeyId, setConfirmKeyId] = useState<string | null>(null);

  const addKey = async () => {
    const value = draft.trim();
    if (!value) return;
    setBusyKey("add");
    try {
      await api.credentialsAddKey(p.name, value);
      setDraft(""); setAdding(false);
      onChanged();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusyKey(null); }
  };

  const removeKey = async (keyId: string) => {
    setBusyKey(keyId);
    try {
      await api.credentialsRemoveKey(p.name, keyId);
      setConfirmKeyId(null);
      onChanged();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusyKey(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {keys.map((k) => (
        <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, minHeight: 28 }}>
          <span style={{ fontFamily: "var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace)", color: text.primary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {k.hint}
          </span>
          {!k.healthy && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: stateColor.danger, whiteSpace: "nowrap" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: stateColor.danger }} />
              {t("keyAuthError")}
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {confirmKeyId === k.id ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: surface.layer2, padding: "2px 6px", borderRadius: 6, border: `1px solid ${surface.border}` }}>
                <span style={{ fontSize: 11, color: text.secondary }}>{t("confirmDelete")}</span>
                <Button size="sm" variant="ghost" onClick={() => void removeKey(k.id)} disabled={busyKey === k.id} style={{ color: stateColor.danger, padding: "0 4px", height: 20 }}>
                  {t("deleteLabel")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmKeyId(null)} style={{ padding: "0 4px", height: 20 }}>
                  {t("cancel")}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" icon={<IconTrashOutline16 size={14} />} onClick={() => setConfirmKeyId(k.id)} disabled={busyKey === k.id} aria-label={t("removeKey")} />
            )}
          </div>
        </div>
      ))}
      {adding ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <input autoFocus type="password" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addKey(); }}
            placeholder={t("addKeyPlaceholder")}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${surface.border}`, background: surface.layer2, color: text.primary, fontFamily: "inherit", fontSize: 13 }} />
          <Button size="sm" variant="primary" onClick={() => void addKey()} disabled={busyKey === "add" || !draft.trim()}>{t("add")}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(""); }}>{t("cancel")}</Button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <Button size="sm" variant="outline" icon={<IconPlusOutline16 size={14} />} onClick={() => setAdding(true)}>{t("addKey")}</Button>
          <Button size="sm" variant="ghost" onClick={onTest} disabled={busy || keys.length === 0}>
            {busy ? t("testingConnection") : t("testConnection")}
          </Button>
        </div>
      )}
      {testResult && (
        <div style={{ fontSize: 12, color: testResult.ok ? stateColor.success : stateColor.danger, display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <StateDot state={testResult.ok ? "done" : "error"} size={8} />
          {testResult.ok
            ? `${t("testOk")} · ${t("testLatencySec", { s: ((testResult.latencyMs ?? 0) / 1000).toFixed(2) })} · ${t("resultCount", { n: testResult.resultCount ?? 0 })}`
            : `${t("testFail")}: ${testResult.error?.message ?? ""}`}
        </div>
      )}
    </div>
  );
}

/** Connection settings (Base URL / custom endpoints) as a clean Settings Row. */
function ConnectionSettingsDisclosure(props: {
  t: TFunc;
  p: ProviderView;
  draftBaseUrl: string;
  setDraftBaseUrl: (v: string) => void;
  onBaseUrl: (url: string) => void;
}) {
  const { t, p, draftBaseUrl, setDraftBaseUrl, onBaseUrl } = props;
  const selfHosted = p.name === "searxng";
  const [open, setOpen] = useState(selfHosted);
  const isConfigured = !!p.baseUrl;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <button
        type="button"
        className="dswt-settings-row clickable"
        onClick={() => setOpen(!open)}
      >
        <div className="dswt-row-icon">
          <IconConsole />
        </div>
        <div className="dswt-row-main">
          <div className="dswt-row-title">{t("connectionSettings")}</div>
        </div>
        <div className="dswt-row-trailing">
          <span style={{ fontSize: 13, color: isConfigured ? "var(--dsw-alias-brand-primary)" : text.tertiary }}>
            {isConfigured ? t("connectionConfigured") : t("connectionDefault")}
          </span>
        </div>
        <div className="dswt-row-chevron">
          <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", display: "inline-flex" }}>
            <IconChevronRightOutline14 size={14} />
          </span>
        </div>
      </button>
      {open && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: text.secondary }}>{t("serviceAddress")}</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={draftBaseUrl}
              onChange={(e) => setDraftBaseUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              onBlur={() => {
                if (draftBaseUrl.trim() !== (p.baseUrl ?? "")) onBaseUrl(draftBaseUrl.trim());
              }}
              placeholder={t("baseUrlPlaceholder")}
              style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${surface.border}`, background: surface.layer2, color: text.primary, fontFamily: "inherit", fontSize: 13 }}
            />
            {p.baseUrl && (
              <Button size="sm" variant="ghost" onClick={() => { setDraftBaseUrl(""); onBaseUrl(""); }}>
                {t("restoreDefaultUrl")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProviderModal(props: Props) {
  adoptWebToolsStyles();
  const { t, p, quota, testResult, busy, showPreferred, inChain, onClose, onToggle, onBaseUrl, onTest, onRefreshQuota, onConfigChanged } = props;
  const [localError, setLocalError] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState(p.baseUrl ?? "");
  const base = providerStatusOf(p, quota, inChain);
  const status = base === "ready" ? (testOutcomeStatus(testResult) ?? base) : base;
  const statusText = {
    ready: t("ready"), "rate-limited": t("rateLimited"), "auth-error": t("authError"),
    "unreachable": t("unreachable"), "not-configured": t("notConfigured"), "disabled": t("disabled"), "not-in-order": t("notInOrder"),
  }[status];
  const statusState: "done" | "warning" | "error" | "ongoing" | "hollow" = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
  const statusColor = status === "ready" ? stateColor.success : status === "auth-error" ? stateColor.danger : status === "rate-limited" || status === "unreachable" ? stateColor.warning : text.tertiary;
  const selfHosted = p.name === "searxng";
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const restoreDraftRef = useRef<(() => void) | null>(null);

  const brand = PROVIDER_BRAND[p.name];

  const sectionTitle = (() => {
    if (p.name === "searxng") return t("connectionSectionTitle");
    if (p.name === "firecrawl" || p.name === "jina") return t("pageReadSettingsTitle");
    if (p.name === "you") return t("searchAndReadSettingsTitle");
    return t("searchSettingsTitle");
  })();

  return (
    <Modal
      open
      onClose={onClose}
      title={p.label}
      headless
      className="dswt-modal-dialog"
    >
      <div className="dswt-modal-body">
        {/* Unified Provider Header: [Logo] Name \n Capability · Preferred | Switch + Close */}
        <div className="dswt-provider-header">
          <div className="dswt-provider-identity">
            {brand && (
              <img
                src={brand.icon}
                alt={p.label}
                className="dswt-provider-logo"
              />
            )}
            <div className="dswt-provider-title-stack">
              <h2 className="dswt-provider-name">
                {p.label}
              </h2>
              <div className="dswt-provider-meta">
                <span>{t(`capability.${p.name}`) || ""}</span>
                {showPreferred && <span>· {t("preferredProviderLabel")}</span>}
              </div>
            </div>
          </div>
          <div className="dswt-provider-actions">
            {status !== "ready" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {statusState === "hollow" ? (
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${text.tertiary}`, flex: "none", boxSizing: "border-box" }} />
                ) : (
                  <StateDot state={statusState} size={8} />
                )}
                <span style={{ color: statusColor, fontWeight: 500, fontSize: 12 }}>{statusText}</span>
              </span>
            )}
            <Switch checked={p.enabled} onChange={onToggle} label={p.enabled ? t("enabledLabel") : t("disabledLabel")} />
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

        {/* 账户: credentials + quota rows + connection settings */}
        <SettingsGroup title={t("accountTitle")} dividers="inset">
          {!selfHosted && (
            <CredentialDisclosure
              t={t}
              p={p}
              onChanged={onConfigChanged}
              onError={setLocalError}
              onTest={onTest}
              busy={busy}
              testResult={testResult}
            />
          )}
          {!selfHosted && <QuotaCard quota={quota} providerName={p.name} t={t} onRefresh={onRefreshQuota} embedded />}
          {(selfHosted || p.baseUrl !== undefined) && (
            <ConnectionSettingsDisclosure
              t={t}
              p={p}
              draftBaseUrl={draftBaseUrl}
              setDraftBaseUrl={setDraftBaseUrl}
              onBaseUrl={onBaseUrl}
            />
          )}
        </SettingsGroup>

        {/* 搜索设置 / 网页读取: provider-native preferences */}
        {p.options && p.name !== "searxng" && (
          <SettingsGroup
            title={sectionTitle}
            dividers="none"
            action={
              showRestore ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => restoreDraftRef.current?.()}
                  style={{ fontSize: 12, padding: "0 4px", height: 20, color: text.secondary }}
                >
                  {t("prefsRestore")}
                </Button>
              ) : undefined
            }
          >
            <div className="dswt-search-card-inner">
              <ProviderPreferencesSection
                t={t}
                p={p}
                onConfigChanged={onConfigChanged}
                onRestoreDraft={(fn) => { restoreDraftRef.current = fn; }}
                onCustomizedChange={(customized) => setShowRestore(customized)}
              />
            </div>
          </SettingsGroup>
        )}

        {/* 高级设置: developer-facing diagnostics, explicit collapse */}
        <SettingsGroup dividers="none">
          <SettingsRow
            icon={
              <div style={{ display: "inline-flex", alignItems: "center", color: text.secondary }}>
                <IconSettingsOutline16 size={16} />
              </div>
            }
            title={t("advancedSettingsTitle")}
            chevron
            isLast
            onClick={() => setAdvancedOpen(!advancedOpen)}
          />
          {advancedOpen && (
            <DeveloperOptions t={t} p={p} onConfigChanged={onConfigChanged} />
          )}
        </SettingsGroup>

        {localError && <div style={{ color: stateColor.danger, fontSize: 12 }}>{localError}</div>}
      </div>
    </Modal>
  );
}
