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
import { api, type ProviderView, type QuotaView, type TestProviderView } from "./api.ts";
import { text, surface, state as stateColor } from "./theme.ts";
import { Switch, type TFunc } from "./WebToolsSection.tsx";
import { providerStatusOf, testOutcomeStatus, quotaSummary, quotaFraction, quotaRemainingLabel, quotaDisplayKind } from "./logic.ts";
import { ProviderPreferencesSection } from "./provider-preferences/ProviderPreferencesSection.tsx";

interface Props {
  t: TFunc;
  p: ProviderView;
  quota?: QuotaView;
  testResult?: TestProviderView;
  busy: boolean;
  isDefault: boolean;
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

/** Credential disclosure: collapsed by default, shows summary line. */
function CredentialDisclosure(props: { t: TFunc; p: ProviderView; onChanged: () => void; onAfterChange: () => void; onError: (msg: string) => void }) {
  const { t, p, onChanged, onAfterChange, onError } = props;
  const [open, setOpen] = useState(false);
  const keys = p.keys ?? [];
  const allHealthy = keys.length > 0 && keys.every((k) => k.healthy);
  const summary = keys.length > 0
    ? `${keys.length} 把 API Key · ${allHealthy ? "均正常" : "部分异常"}`
    : t("notConfigured");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => keys.length > 0 && setOpen(!open)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && keys.length > 0) { e.preventDefault(); setOpen(!open); } }}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: keys.length > 0 ? "pointer" : "default", fontSize: 12, color: text.secondary, outline: "none" }}
      >
        {keys.length > 0 && (
          <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", flex: "none", color: text.tertiary, display: "inline-flex" }}>
              <IconChevronRightOutline14 size={12} />
            </span>
        )}
        <span>{summary}</span>
        {keys.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} style={{ marginLeft: "auto", fontSize: 11 }}>
            {open ? t("collapse") : t("manage")}
          </Button>
        )}
      </div>
      {open && p.keyWritable && (
        <CredentialList t={t} p={p} onChanged={onChanged} onAfterChange={onAfterChange} onError={onError} />
      )}
    </div>
  );
}

/** Key list body (same as before, extracted for clarity). */
function CredentialList(props: { t: TFunc; p: ProviderView; onChanged: () => void; onAfterChange: () => void; onError: (msg: string) => void }) {
  const { t, p, onChanged, onAfterChange, onError } = props;
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
      await onAfterChange();
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
  const { t, p, quota, testResult, busy, isDefault, inChain, onClose, onToggle, onBaseUrl, onTest, onRefreshQuota, onConfigChanged } = props;
  const [localError, setLocalError] = useState("");
  const base = providerStatusOf(p, quota, inChain);
  const status = base === "ready" ? (testOutcomeStatus(testResult) ?? base) : base;
  const statusText = {
    ready: t("ready"), "rate-limited": t("rateLimited"), "auth-error": t("authError"),
    "unreachable": t("unreachable"), "not-configured": t("notConfigured"), "not-in-chain": t("notInChain"),
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
          overflow-y: auto !important;
          flex: 1 !important;
          min-height: 0 !important;
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
          {/* Top row: enabled + status + quota inline */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Switch checked={p.enabled} onChange={onToggle} label={p.enabled ? t("enabledLabel") : t("disabledLabel")} />
            <span style={{ color: text.secondary, fontSize: 13 }}>{p.enabled ? t("enabledLabel") : t("disabledLabel")}</span>
            {isDefault && (
              <span style={{ color: "var(--dsw-alias-brand-primary)", fontSize: 11, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px" }}>
                {t("defaultProviderLabel")}
              </span>
            )}
            {!inChain && <span style={{ color: text.tertiary, fontSize: 12 }}>{t("notInChain")}</span>}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              {statusState === "hollow" ? (
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${text.tertiary}`, flex: "none", boxSizing: "border-box" }} />
              ) : (
                <StateDot state={statusState} size={8} />
              )}
              <span style={{ color: statusColor, fontWeight: 500, fontSize: 13 }}>{statusText}</span>
              {status === "ready" && <span style={{ color: text.tertiary, fontSize: 11 }}>· {t("connected")}</span>}
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

          {/* Credentials: collapsed by default */}
          <CredentialDisclosure t={t} p={p} onChanged={onConfigChanged} onAfterChange={onTest} onError={setLocalError} />

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

          {localError && <div style={{ color: stateColor.danger, fontSize: 12 }}>{localError}</div>}
        </div>
      </Modal>
    </>
  );
}