/**
 * dsh-web-tools — provider detail dialog (Modal).
 *
 * Compact, fixed-height layout: header/footer are sticky, body scrolls.
 * Overview (status + quota) compressed into one line; credentials collapsed
 * by default.
 * @module
 */
import { useState, type CSSProperties } from "react";
import { Button, IconChevronRightOutline14, IconPlusOutline16, IconRefreshOutline16, IconTrashOutline16, Modal, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import { api, type ProviderView, type QuotaView, type TestProviderView } from "./api.ts";
import { text, surface, state as stateColor } from "./theme.ts";
import { Switch, type TFunc } from "./WebToolsSection.tsx";
import { providerStatusOf, testOutcomeStatus, quotaSummary, quotaFraction, quotaRemainingLabel, quotaDisplayKind } from "./logic.ts";
import { ProviderPreferencesSection } from "./provider-preferences/ProviderPreferencesSection.tsx";
import { PROVIDER_BRAND } from "./brand.ts";

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
  onConfigChanged: () => void;
}

/** Inline quota summary line (compact, no bar). */
function QuotaInline(props: { quota: QuotaView; t: TFunc }) {
  const { quota, t } = props;
  const kind = quotaDisplayKind(quota);
  if (kind === "unavailable" || kind === "self_hosted") return null;
  if (kind === "unlimited") return <span style={{ color: text.secondary, fontSize: 12 }}>{t("quotaUnlimited")}</span>;
  const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || "";
  const fraction = quotaFraction(quota);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: text.secondary }}>
      <span>{label}</span>
      {fraction !== undefined && (
        <span style={{ width: 60, height: 4, borderRadius: 2, background: surface.layer2, overflow: "hidden", display: "inline-block" }}>
          <span style={{ width: `${fraction * 100}%`, height: "100%", background: stateColor.success, display: "block" }} />
        </span>
      )}
    </span>
  );
}

/** Developer layer: raw provider-native parameters. Effective values are
 *  read-only; overrides are editable as JSON (parsed + saved through the
 *  Host's sanitize gate). */
function DeveloperOptions(props: { t: TFunc; p: ProviderView; onConfigChanged: () => void }) {
  const { t, p, onConfigChanged } = props;
  const [open, setOpen] = useState(false);
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
    <div style={{ borderTop: `1px solid ${surface.border}`, paddingTop: 12, marginTop: 2 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", outline: "none" }}
      >
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", color: text.tertiary, display: "inline-flex", flex: "none" }}>
          <IconChevronRightOutline14 size={12} />
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, color: text.primary }}>{t("developerOptions")}</span>
        <span style={{ color: text.tertiary, fontSize: 12 }}>{t("developerOptionsHint")}</span>
      </div>
      {open && (
        <div>
          <div style={{ fontSize: 11, color: text.tertiary, marginTop: 10 }}>{t("developerEffective")}</div>
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
      )}
    </div>
  );
}
function CredentialDisclosure(props: { t: TFunc; p: ProviderView; onChanged: () => void; onError: (msg: string) => void }) {
  const { t, p, onChanged, onError } = props;
  const [open, setOpen] = useState(false);
  const keys = p.keys ?? [];
  const allHealthy = keys.length > 0 && keys.every((k) => k.healthy);
  const summary = keys.length > 0
    ? `${keys.length} 个 · ${allHealthy ? "均正常" : "部分异常"}`
    : t("notConfigured");
  const canOpen = p.keyWritable;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => canOpen && setOpen(!open)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && canOpen) { e.preventDefault(); setOpen(!open); } }}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: canOpen ? "pointer" : "default", fontSize: 12, color: text.secondary, outline: "none" }}
      >
        {keys.length > 0 && (
          <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", flex: "none", color: text.tertiary, display: "inline-flex" }}>
              <IconChevronRightOutline14 size={12} />
            </span>
        )}
        <span>{summary}</span>
        {keys.length === 0 && canOpen && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)} style={{ marginLeft: "auto", fontSize: 11 }}>
            {t("addKey")}
          </Button>
        )}
        {keys.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} style={{ marginLeft: "auto", fontSize: 11 }}>
            {open ? t("collapse") : t("manage")}
          </Button>
        )}
      </div>
      {open && p.keyWritable && (
        <CredentialList t={t} p={p} onChanged={onChanged} onError={onError} />
      )}
    </div>
  );
}

/** Key list body (same as before, extracted for clarity). Adding a key
 *  updates the config state but never auto-runs a paid search — the user
 *  clicks 测试连接 themselves. */
function CredentialList(props: { t: TFunc; p: ProviderView; onChanged: () => void; onError: (msg: string) => void }) {
  const { t, p, onChanged, onError } = props;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const keys = p.keys ?? [];

  const addKey = async () => {
    const value = draft.trim();
    if (!value) return;
    setBusy("add");
    try {
      await api.credentialsAddKey(p.name, value);
      setDraft(""); setAdding(false);
      onChanged();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const removeKey = async (keyId: string) => {
    setBusy(keyId);
    try {
      await api.credentialsRemoveKey(p.name, keyId);
      onChanged();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {keys.map((k) => (
        <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ fontFamily: "var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace)", color: text.primary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {k.hint}
          </span>
          <span style={{ color: k.healthy ? stateColor.success : stateColor.danger, fontSize: 12, whiteSpace: "nowrap" }}>
            {k.healthy ? t("keyReady") : t("keyAuthError")}
          </span>
          <span style={{ marginLeft: "auto" }}>
            <Button size="sm" variant="ghost" icon={<IconTrashOutline16 size={14} />} onClick={() => void removeKey(k.id)} disabled={busy === k.id} aria-label={t("removeKey")} />
          </span>
        </div>
      ))}
      {adding ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <input autoFocus type="password" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addKey(); }}
            placeholder={t("addKeyPlaceholder")}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${surface.border}`, background: surface.layer2, color: text.primary, fontFamily: "inherit", fontSize: 13 }} />
          <Button size="sm" variant="primary" onClick={() => void addKey()} disabled={busy === "add" || !draft.trim()}>{t("add")}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(""); }}>{t("cancel")}</Button>
        </div>
      ) : (
        <div style={{ marginTop: 4 }}>
          <Button size="sm" variant="outline" icon={<IconPlusOutline16 size={14} />} onClick={() => setAdding(true)}>{t("addKey")}</Button>
        </div>
      )}
    </div>
  );
}

export function ProviderModal(props: Props) {
  const { t, p, quota, testResult, busy, showPreferred, inChain, onClose, onToggle, onBaseUrl, onTest, onRefreshQuota, onConfigChanged } = props;
  const [localError, setLocalError] = useState("");
  const base = providerStatusOf(p, quota, inChain);
  const status = base === "ready" ? (testOutcomeStatus(testResult) ?? base) : base;
  const statusText = {
    ready: t("ready"), "rate-limited": t("rateLimited"), "auth-error": t("authError"),
    "unreachable": t("unreachable"), "not-configured": t("notConfigured"), "disabled": t("disabled"), "not-in-order": t("notInOrder"),
  }[status];
  const statusState = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow" as const;
  const statusColor = status === "ready" ? stateColor.success : status === "auth-error" ? stateColor.danger : status === "rate-limited" || status === "unreachable" ? stateColor.warning : text.tertiary;
  const selfHosted = p.name === "searxng";
  const [refreshing, setRefreshing] = useState(false);

  return (
    <>
      <style>{`
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
      `}</style>
      <Modal
        open
        onClose={onClose}
        title={p.label}
        closeLabel={t("close")}
        description={p.description}
        className="wt-modal-dialog"
        contentClassName="wt-modal-content"
        footer={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button variant="primary" onClick={onTest} disabled={busy} style={{ flex: "none" }}>
              {busy ? t("testingConnection") : t("testConnection")}
            </Button>
            {testResult && (
              <span style={{ fontSize: 12, color: testResult.ok ? stateColor.success : stateColor.danger, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <StateDot state={testResult.ok ? "done" : "error"} size={8} />
                {testResult.ok
                  ? `${t("testOk")} · ${testResult.latencyMs}ms · ${t("resultCount", { n: testResult.resultCount ?? 0 })}`
                  : `${t("testFail")}: ${testResult.error?.message ?? ""}`}
              </span>
            )}
            <span style={{ marginLeft: "auto", flex: "none" }}>
              <Button variant="ghost" onClick={onClose}>{t("close")}</Button>
            </span>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Provider identity: logo + name + description */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {PROVIDER_BRAND[p.name] && (
              <img src={PROVIDER_BRAND[p.name].icon} alt="" width={32} height={32} style={{ borderRadius: 8, flex: "none" }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: text.primary }}>{p.label}</div>
              {p.description && <div style={{ fontSize: 12, color: text.secondary, marginTop: 1 }}>{p.description}</div>}
            </div>
          </div>

          {/* Top row: enabled + status + quota inline */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Switch checked={p.enabled} onChange={onToggle} label={p.enabled ? t("enabledLabel") : t("disabledLabel")} />
            <span style={{ color: text.secondary, fontSize: 13 }}>{p.enabled ? t("enabledLabel") : t("disabledLabel")}</span>
            {showPreferred && (
              <span style={{ color: "var(--dsw-alias-brand-primary)", fontSize: 11, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px" }}>
                {t("preferredProviderLabel")}
              </span>
            )}
            {!inChain && <span style={{ color: text.tertiary, fontSize: 12 }}>{t("notInOrder")}</span>}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              {statusState === "hollow" ? (
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${text.tertiary}`, flex: "none", boxSizing: "border-box" }} />
              ) : (
                <StateDot state={statusState} size={8} />
              )}
              <span style={{ color: statusColor, fontWeight: 500, fontSize: 13 }}>{statusText}</span>
            </span>
          </div>

          {/* Quota: inline summary + refresh button */}
          {quota && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <QuotaInline quota={quota} t={t} />
              <Button size="sm" variant="ghost" icon={<IconRefreshOutline16 size={12} />} onClick={() => { setRefreshing(true); onRefreshQuota(); setTimeout(() => setRefreshing(false), 600); }} disabled={refreshing} style={{ fontSize: 11 }}>
                {t("refreshQuota")}
              </Button>
            </div>
          )}

          {/* Credentials: collapsed by default; always openable so a provider
              with no keys can receive its first key without a test. */}
          <CredentialDisclosure t={t} p={p} onChanged={onConfigChanged} onError={setLocalError} />

          {/* Base URL (self-hosted / custom endpoints) */}
          {(selfHosted || p.baseUrl !== undefined) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={p.baseUrl ?? ""} onChange={(e) => onBaseUrl(e.target.value)} placeholder={t("baseUrlPlaceholder")}
                  style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${surface.border}`, background: surface.layer2, color: text.primary, fontFamily: "inherit", fontSize: 13 }} />
                {!p.baseUrl && <span style={{ color: text.tertiary, fontSize: 12, whiteSpace: "nowrap" }}>{t("baseUrlDefault")}</span>}
              </div>
            </div>
          )}

          {/* Search Experience / Provider-native settings (P4) */}
          <ProviderPreferencesSection t={t} p={p} onConfigChanged={onConfigChanged} />

          {/* Developer layer: raw provider-native parameters */}
          <DeveloperOptions t={t} p={p} onConfigChanged={onConfigChanged} />

          {localError && <div style={{ color: stateColor.danger, fontSize: 12 }}>{localError}</div>}
        </div>
      </Modal>
    </>
  );
}