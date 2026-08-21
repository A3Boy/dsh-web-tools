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
  onConfigChanged: () => Promise<void> | void;
}

/** Quiet human source label (no "Official/Authoritative" tag stacking). */
function quotaSourceLabel(t: TFunc, source?: string): string {
  if (!source) return "";
  const key = `quotaSource${source[0].toUpperCase()}${source.slice(1)}` as const;
  const value = t(key);
  return value !== key ? value : t("quotaSource", { s: source });
}

/** Full rich quota display: progress bar, percentage, source, updated-ago, breakdown. */
function QuotaSection(props: { quota: QuotaView; t: TFunc; onRefresh: () => void }) {
  const { quota, t, onRefresh } = props;
  const [refreshing, setRefreshing] = useState(false);
  const kind = quotaDisplayKind(quota);
  if (kind === "unavailable" || kind === "self_hosted") return null;

  const fraction = quotaFraction(quota);
  const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || "";
  const ago = quota.fetchedAt !== undefined
    ? (quota.fetchedAt > Date.now() - 60_000 ? t("updatedJustNow") : t("updatedAgo", { mins: Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 60_000)) }))
    : undefined;
  const overPlan = quota.remaining !== undefined && quota.limit !== undefined && quota.remaining > quota.limit
    ? t("quotaOverPlan", { r: quota.remaining.toLocaleString(), l: quota.limit.toLocaleString() })
    : undefined;
  const meta = [overPlan, quotaSourceLabel(t, quota.source), ago]
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .join(" · ");

  const refresh = async () => {
    setRefreshing(true);
    try {
      onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${surface.border}`, paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: text.primary }}>{t("quotaTitle")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: text.secondary, fontWeight: 500 }}>{label}</span>
          <Button size="sm" variant="ghost" icon={<IconRefreshOutline16 size={12} />} onClick={() => void refresh()} disabled={refreshing} style={{ padding: "2px 4px" }}>
            {t("refreshQuota")}
          </Button>
        </div>
      </div>
      {fraction !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: surface.layer2, overflow: "hidden" }}>
            <div style={{ width: `${fraction * 100}%`, height: "100%", background: stateColor.success, transition: "width .3s ease" }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: stateColor.success }}>{Math.round(fraction * 100)}%</span>
        </div>
      )}
      {meta && <span style={{ color: text.tertiary, fontSize: 11 }}>{meta}</span>}
      {quota.breakdown && Object.keys(quota.breakdown).length > 0 && (
        <span style={{ color: text.tertiary, fontSize: 11 }}>
          {t("usage")}: {Object.entries(quota.breakdown).map(([k, v]) => `${k} ${v}`).join(" · ")}
        </span>
      )}
    </div>
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
  const invalidCount = keys.filter((k) => !k.healthy).length;
  const allHealthy = keys.length > 0 && invalidCount === 0;

  const summaryText = keys.length === 0
    ? t("notConfigured")
    : allHealthy
      ? t("keyReady")
      : t("keysSomeIssues", { n: invalidCount });

  const summaryColor = keys.length === 0
    ? text.tertiary
    : allHealthy
      ? stateColor.success
      : stateColor.danger;

  const canOpen = p.keyWritable;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${surface.border}`, paddingTop: 12 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => canOpen && setOpen(!open)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && canOpen) { e.preventDefault(); setOpen(!open); } }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: canOpen ? "pointer" : "default", outline: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", color: text.tertiary, display: "inline-flex", flex: "none" }}>
            <IconChevronRightOutline14 size={12} />
          </span>
          <span style={{ fontWeight: 600, fontSize: 13, color: text.primary }}>{t("credentials")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: allHealthy ? 400 : 600, color: summaryColor }}>{summaryText}</span>
          {keys.length === 0 && canOpen && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpen(true); }} style={{ fontSize: 11 }}>
              {t("addKey")}
            </Button>
          )}
          {keys.length > 0 && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{ fontSize: 11 }}>
              {open ? t("collapse") : t("manage")}
            </Button>
          )}
        </div>
      </div>
      {open && p.keyWritable && (
        <div style={{ paddingLeft: 18, marginTop: 4 }}>
          <CredentialList t={t} p={p} onChanged={onChanged} onError={onError} />
        </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${surface.border}`, paddingTop: 12 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", outline: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", color: text.tertiary, display: "inline-flex", flex: "none" }}>
            <IconChevronRightOutline14 size={12} />
          </span>
          <span style={{ fontWeight: 600, fontSize: 13, color: text.primary }}>{t("connectionSettings")}</span>
        </div>
        <span style={{ fontSize: 12, color: isConfigured ? "var(--dsw-alias-brand-primary)" : text.tertiary }}>
          {isConfigured ? t("connectionConfigured") : t("connectionDefault")}
        </span>
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 18, marginTop: 4 }}>
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
  const { t, p, quota, testResult, busy, showPreferred, inChain, onClose, onToggle, onBaseUrl, onTest, onRefreshQuota, onConfigChanged } = props;
  const [localError, setLocalError] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState(p.baseUrl ?? "");
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
        description={t(`capability.${p.name}`) || ""}
        className="wt-modal-dialog"
        contentClassName="wt-modal-content"
        footer={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button variant="outline" onClick={onTest} disabled={busy} style={{ flex: "none" }}>
              {busy ? t("testingConnection") : t("testConnection")}
            </Button>
            {testResult && (
              <span style={{ fontSize: 12, color: testResult.ok ? stateColor.success : stateColor.danger, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <StateDot state={testResult.ok ? "done" : "error"} size={8} />
                {testResult.ok
                  ? `${t("testOk")} · ${(testResult.latencyMs / 1000).toFixed(2)} ${t("secondsUnit")} · ${t("resultCount", { n: testResult.resultCount ?? 0 })}`
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

          {/* Quota: rich statistical section with progress + breakdown + refresh */}
          {quota && <QuotaSection quota={quota} t={t} onRefresh={onRefreshQuota} />}

          {/* Credentials: collapsed by default; always openable so a provider
              with no keys can receive its first key without a test. (SearXNG needs no key) */}
          {!selfHosted && <CredentialDisclosure t={t} p={p} onChanged={onConfigChanged} onError={setLocalError} />}

          {/* Connection settings (Base URL / custom endpoints) */}
          {(selfHosted || p.baseUrl !== undefined) && (
            <ConnectionSettingsDisclosure
              t={t}
              p={p}
              draftBaseUrl={draftBaseUrl}
              setDraftBaseUrl={setDraftBaseUrl}
              onBaseUrl={onBaseUrl}
            />
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