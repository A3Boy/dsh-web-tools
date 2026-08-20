/**
 * dsh-web-tools — provider detail dialog (Modal).
 *
 * One provider's full management surface: enabled switch, status, quota with
 * progress + refresh, per-key credential list with add/remove (the Host keeps
 * its comma-joined credential string; the browser only ever sees masked
 * hints), self-hosted Base URL, and a connection test.
 *
 * Default page shows NO password input — editing happens one key at a time.
 * @module
 */
import { useState } from "react";
import { Button, IconPlusOutline16, IconRefreshOutline16, IconTrashOutline16, Modal, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import { api, type ProviderView, type QuotaView, type TestProviderView } from "./api.ts";
import { text, surface, state as stateColor } from "./theme.ts";
import { Switch, type TFunc } from "./WebToolsSection.tsx";
import { providerStatusOf, testOutcomeStatus, quotaSummary, quotaFraction, quotaRemainingLabel, quotaDisplayKind, formatProviderOptionsSummary } from "./logic.ts";

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
  /** Reload config after credential edits (key list changes). */
  onConfigChanged: () => void;
}

function QuotaBar(props: { quota: QuotaView; t: TFunc; onRefresh: () => void }) {
  const { quota, t, onRefresh } = props;
  const [refreshing, setRefreshing] = useState(false);
  const kind = quotaDisplayKind(quota);

  // Unsupported / self-hosted / unlimited: one quiet line, no buttons.
  if (kind === "unavailable") {
    return <span style={{ color: text.tertiary, fontSize: 12 }}>{t("quotaUnavailable")}</span>;
  }
  if (kind === "self_hosted") {
    return <span style={{ color: text.tertiary, fontSize: 12 }}>{t("quotaSelfHostedShort")}</span>;
  }
  if (kind === "unlimited") {
    return <span style={{ color: text.secondary, fontSize: 12 }}>{t("quotaUnlimited")}</span>;
  }

  // Conditional progress: a bar is drawn ONLY when remaining ≤ limit in a
  // countable unit (quotaFraction handles the honesty rule). Fill = GREEN
  // (remaining share), track = gray (used share).
  const fraction = quotaFraction(quota);
  const fillColor = stateColor.success;
  const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || t("quotaUnavailable");
  const ago = quota.fetchedAt !== undefined
    ? (quota.fetchedAt > Date.now() - 60_000 ? t("updatedJustNow") : t("updatedAgo", { mins: Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 60_000)) }))
    : undefined;
  // Over-plan (bonus above the plan): show remaining vs plan as text, never
  // a >100% bar. quotaFraction already returns undefined in that case.
  const overPlan = quota.remaining !== undefined && quota.limit !== undefined && quota.remaining > quota.limit
    ? t("quotaOverPlan", { r: quota.remaining.toLocaleString(), l: quota.limit.toLocaleString() })
    : undefined;
  // One quiet meta line: over-plan / source · updated (no stacking).
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, color: text.primary }}>{label}</span>
        {fraction !== undefined && (
          <span style={{ color: fillColor, fontSize: 12, fontWeight: 600 }}>{Math.round(fraction * 100)}%</span>
        )}
        <span style={{ marginLeft: "auto" }}>
          <Button size="sm" variant="ghost" icon={<IconRefreshOutline16 size={14} />} onClick={() => void refresh()} disabled={refreshing}>
            {t("refreshQuota")}
          </Button>
        </span>
      </div>
      {fraction !== undefined && (
        <div style={{ height: 6, borderRadius: 3, background: surface.layer2, overflow: "hidden" }}>
          <div style={{ width: `${fraction * 100}%`, height: "100%", background: fillColor, transition: "width .3s ease" }} />
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

/** Quiet human source label (no "Official/Authoritative" tag stacking). */
function quotaSourceLabel(t: TFunc, source?: string): string {
  if (!source) return "";
  const key = `quotaSource${source[0].toUpperCase()}${source.slice(1)}` as const;
  const value = t(key);
  return value !== key ? value : t("quotaSource", { s: source });
}

/** Credential list: masked hints + health + add/remove (no plaintext). */
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
      setDraft("");
      setAdding(false);
      onChanged();
      // Real connection test with the freshly added key — "configured" is not
      // "connected", so the card must verify before showing a green state.
      // Reload AFTER the test so the tested key's health lands in the list.
      await onAfterChange();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const removeKey = async (keyId: string) => {
    setBusy(keyId);
    try {
      await api.credentialsRemoveKey(p.name, keyId);
      // No auto test after removal: with the last key gone the probe would
      // only produce a misleading "no API key configured" error. The card
      // reload reflects the smaller pool; the operator can test again.
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {keys.length > 0 && (
        <span style={{ color: text.secondary, fontSize: 12 }}>{t("keysConfigured", { n: keys.length })}</span>
      )}
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
          <input
            autoFocus
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addKey(); }}
            placeholder={t("addKeyPlaceholder")}
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
          />
          <Button size="sm" variant="primary" onClick={() => void addKey()} disabled={busy === "add" || !draft.trim()}>
            {t("add")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(""); }}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <div style={{ marginTop: 4 }}>
          <Button size="sm" variant="outline" icon={<IconPlusOutline16 size={14} />} onClick={() => setAdding(true)}>
            {t("addKey")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ProviderModal(props: Props) {
  const { t, p, quota, testResult, busy, isDefault, inChain, onClose, onToggle, onBaseUrl, onTest, onRefreshQuota, onConfigChanged } = props;
  const [localError, setLocalError] = useState("");
  // A connection test can only refine a "ready" guess — it must never flip
  // "not configured" / "not in chain" to auth-error, and a stale failure
  // (key since removed) must not keep a provider red forever.
  const base = providerStatusOf(p, quota, inChain);
  const status = base === "ready" ? (testOutcomeStatus(testResult) ?? base) : base;
  const statusText = {
    ready: t("ready"),
    "rate-limited": t("rateLimited"),
    "auth-error": t("authError"),
    "unreachable": t("unreachable"),
    "not-configured": t("notConfigured"),
    "not-in-chain": t("notInChain"),
  }[status];
  // Gray hollow dot for unconfigured / not-in-chain; colored only for real states.
  const statusState = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow" as const;
  const statusColor = status === "ready" ? stateColor.success : status === "auth-error" ? stateColor.danger : status === "rate-limited" || status === "unreachable" ? stateColor.warning : text.tertiary;
  const selfHosted = p.name === "searxng";

  return (
    <Modal
      open
      onClose={onClose}
      title={p.label}
      closeLabel={t("close")}
      description={p.description}
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
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Enabled + role */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Switch checked={p.enabled} onChange={onToggle} label={p.enabled ? t("enabledLabel") : t("disabledLabel")} />
          <span style={{ color: text.secondary, fontSize: 13 }}>
            {p.enabled ? t("enabledLabel") : t("disabledLabel")}
          </span>
          {isDefault && (
            <span style={{ color: "var(--dsw-alias-brand-primary)", fontSize: 12, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px" }}>
              {t("defaultProviderLabel")}
            </span>
          )}
          {!inChain && <span style={{ color: text.tertiary, fontSize: 12 }}>{t("notInChain")}</span>}
        </div>

        {/* Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: text.secondary }}>{t("providerStatus")}</h4>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            {statusState === "hollow" ? (
              <span
                aria-hidden
                style={{ width: 10, height: 10, borderRadius: "50%", border: `1.5px solid ${text.tertiary}`, flex: "none", boxSizing: "border-box" }}
              />
            ) : (
              <StateDot state={statusState} size={10} />
            )}
            <span style={{ color: statusColor, fontWeight: 500 }}>
              {statusText}
            </span>
            {status === "ready" && <span style={{ color: text.tertiary, fontSize: 12 }}>· {t("connected")}</span>}
          </div>
        </div>

        {/* Quota */}
        {quota && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: text.secondary }}>{t("quotaTitle")}</h4>
            <QuotaBar quota={quota} t={t} onRefresh={onRefreshQuota} />
          </div>
        )}

        {/* Credentials */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: text.secondary }}>{t("credentials")}</h4>
          {p.keyWritable ? (
            <CredentialList t={t} p={p} onChanged={onConfigChanged} onAfterChange={onTest} onError={setLocalError} />
          ) : (
            <span style={{ color: text.tertiary, fontSize: 12 }}>{t("notConfigured")}</span>
          )}
        </div>

        {/* Base URL (self-hosted / custom endpoints) */}
        {(selfHosted || p.baseUrl !== undefined) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: text.secondary }}>{t("baseUrlLabel")}</h4>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={p.baseUrl ?? ""}
                onChange={(e) => onBaseUrl(e.target.value)}
                placeholder={t("baseUrlPlaceholder")}
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
              />
              {!p.baseUrl && <span style={{ color: text.tertiary, fontSize: 12, whiteSpace: "nowrap" }}>{t("baseUrlDefault")}</span>}
            </div>
          </div>
        )}

        {/* Search Experience / Provider-native settings (P4) */}
        <ProviderPreferencesSection t={t} p={p} onConfigChanged={onConfigChanged} />

        {localError && <div style={{ color: stateColor.danger, fontSize: 12 }}>{localError}</div>}
      </div>
    </Modal>
  );
}

function ProviderPreferencesSection({ t, p, onConfigChanged }: { t: (k: string) => string; p: ProviderView; onConfigChanged: () => void }) {
  if (!p.options || p.name === "jina" || p.name === "searxng") return null;
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>(() => ({ ...p.options?.overrides }));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const eff = p.options.effective;
  const isDef = p.options.isDefault;

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.providerOptionsSet(p.name, draft);
      onConfigChanged();
      setMsg("已保存");
      setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.providerOptionsReset(p.name);
      setDraft({});
      onConfigChanged();
      setMsg("已恢复推荐");
      setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg("恢复失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${surface.border}`, paddingTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: text.primary }}>搜索偏好</div>
          <div style={{ fontSize: 12, color: isDef ? text.secondary : stateColor.business, marginTop: 2 }}>
            {formatProviderOptionsSummary(p.name, eff)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, cursor: "pointer", border: `1px solid ${surface.border}`, background: "transparent", color: text.primary }}
        >
          {expanded ? "收起" : "自定义"}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
          {/* Controls rendered conditionally per provider */}
          {p.name === "exa" && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: text.secondary, marginBottom: 4 }}>检索方式</label>
              <select
                value={draft.searchType ?? "auto"}
                onChange={(e) => setDraft({ ...draft, searchType: e.target.value })}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${surface.border}` }}
              >
                <option value="auto">自动平衡（推荐）</option>
                <option value="fast">快速（更低延迟）</option>
                <option value="instant">极速（最低延迟）</option>
                <option value="deep-lite">深度概览（较慢）</option>
                <option value="deep">深度检索（慢）</option>
                <option value="deep-reasoning">深度推理（最详尽）</option>
              </select>
            </div>
          )}

          {p.name === "tavily" && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: text.secondary, marginBottom: 4 }}>检索深度</label>
              <select
                value={draft.searchDepth ?? "basic"}
                onChange={(e) => setDraft({ ...draft, searchDepth: e.target.value })}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${surface.border}` }}
              >
                <option value="basic">平衡搜索（1 credit，推荐）</option>
                <option value="fast">快速搜索（1 credit）</option>
                <option value="ultra-fast">极速搜索（1 credit）</option>
                <option value="advanced">高质量搜索（2 credits）</option>
              </select>
            </div>
          )}

          {p.name === "brave" && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: text.secondary, marginBottom: 4 }}>检索模式</label>
              <select
                value={draft.endpointPreference ?? "auto"}
                onChange={(e) => setDraft({ ...draft, endpointPreference: e.target.value })}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${surface.border}` }}
              >
                <option value="auto">智能上下文 · 推荐（LLM Context，失败自动回退）</option>
                <option value="llm-context">仅智能上下文（LLM Context）</option>
                <option value="web-search">传统网页搜索</option>
              </select>
            </div>
          )}

          {p.name === "you" && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: text.secondary, marginBottom: 4 }}>检索展现</label>
              <select
                value={draft.extractionMode ?? "highlights"}
                onChange={(e) => setDraft({ ...draft, extractionMode: e.target.value })}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${surface.border}` }}
              >
                <option value="highlights">AI 相关片段（推荐，质量更高）</option>
                <option value="none">简短摘要（轻量）</option>
              </select>
            </div>
          )}

          {p.name === "parallel" && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: text.secondary, marginBottom: 4 }}>检索质量</label>
              <select
                value={draft.mode ?? "advanced"}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value })}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${surface.border}` }}
              >
                <option value="advanced">高质量搜索（推荐）</option>
                <option value="basic">快速搜索</option>
              </select>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            {!isDef && (
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, cursor: "pointer", border: `1px solid ${surface.border}`, background: "transparent", color: text.secondary }}
              >
                恢复推荐
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "4px 12px", fontSize: 12, borderRadius: 4, cursor: "pointer", border: "none", background: stateColor.business, color: "#fff" }}
            >
              {saving ? "保存中..." : "保存偏好"}
            </button>
          </div>
          {msg && <div style={{ fontSize: 12, color: stateColor.business, textAlign: "right" }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
