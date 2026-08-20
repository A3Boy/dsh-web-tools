/**
 * dsh-web-tools — Web Search settings page (settings.section, id "web-tools").
 *
 * Information architecture: a one-level Settings page.
 *   - header row: title + enabled switch
 *   - search order summary + edit entry (RoutingModal)
 *   - Providers: one unified list surface (row per provider → ProviderModal)
 *   - Test Search (real run through the Host chain, human-readable timeline)
 *   - Advanced: collapsible low-frequency knobs (timeout)
 *
 * Credentials are NEVER shown as plaintext: the page shows masked hints and
 * manages keys one at a time through Host add/remove endpoints; the Host
 * keeps its existing comma-joined credential string contract.
 * @module
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  IconChevronRightOutline14,
  IconEditOutline16,
  IconSearchOutline16,
  Input,
  StateDot,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { api, type ConfigView, type QuotaView, type TestProviderView, type TestSearchView, type ProviderView } from "./api.ts";
import { text, surface, state as stateColor, button as buttonColor } from "./theme.ts";
import { ProviderModal } from "./ProviderModal.tsx";
import { RoutingModal } from "./RoutingModal.tsx";
import type { UiFace } from "./registration.ts";
import { PROVIDER_BRAND } from "./brand.ts";
import {
  providerStatusOf,
  testOutcomeStatus,
  quotaSummary,
  quotaFraction,
  quotaDisplayKind,
  quotaRemainingLabel,
  quotaMetaLine,
  outcomeLabel,
  resolveUiLanguage,
  translateDict,
  type UiLangPref,
  type TFunc,
  type ProviderStatus,
} from "./logic.ts";

export type { TFunc, ProviderStatus };
export { providerStatusOf, quotaSummary, outcomeLabel };

/** Local switch (DSH primitives ship no toggle; role=switch keeps it accessible). */
export function Switch(props: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  const { checked, onChange, label } = props;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "1px solid " + (checked ? "transparent" : surface.border),
        background: checked ? buttonColor.primaryFill : surface.layer2,
        cursor: "pointer",
        flex: "none",
        padding: 0,
        transition: "background .15s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: checked ? buttonColor.primaryText : text.tertiary,
          transition: "left .15s ease",
        }}
      />
    </button>
  );
}

interface SectionProps {
  t: TFunc;
  /** Page-language face for the independent language switch (see registration). */
  ui?: UiFace;
}

/** One provider card in the providers list (click → ProviderModal).
 *  Cards in the search chain are draggable to reorder; cards outside the
 *  chain render non-draggable with a "not in chain" tag. */
function ProviderCard(props: {
  t: TFunc;
  p: ProviderView;
  quota?: QuotaView;
  /** Last connection-test result (drives the row status when it overrides). */
  testResult?: TestProviderView;
  orderRank?: number;
  isDefault: boolean;
  draggable: boolean;
  isDragOver: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const { t, p, quota, testResult, orderRank, isDefault, draggable, isDragOver, onClick, onDragStart, onDragOver, onDrop, onDragEnd } = props;
  const inChain = orderRank !== undefined;
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
  const selfHosted = p.name === "searxng";
  // Gray hollow dot for "not configured" / "not in chain"; colored dots only
  // for real states (green ready / amber rate-limited & unreachable / red auth error).
  const dotState: "done" | "warning" | "error" | "ongoing" | "hollow" =
    status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
  const statusColor = status === "ready" ? stateColor.success : status === "auth-error" ? stateColor.danger : status === "rate-limited" || status === "unreachable" ? stateColor.warning : text.tertiary;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="wt-provider-row"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 14px",
        background: isDragOver ? surface.hover : surface.layer1,
        border: `1px solid ${isDragOver ? "var(--dsw-alias-brand-primary)" : surface.border}`,
        borderRadius: 12,
        cursor: draggable ? "grab" : "pointer",
        fontFamily: "inherit",
        fontSize: 14,
        color: text.primary,
        textAlign: "left",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => { if (!isDragOver) e.currentTarget.style.background = surface.hover; }}
      onMouseLeave={(e) => { if (!isDragOver) e.currentTarget.style.background = surface.layer1; }}
    >
      {draggable && (
        <span aria-hidden style={{ color: text.tertiary, fontSize: 14, cursor: "grab", userSelect: "none", flex: "none" }}>
          ⠿
        </span>
      )}
      {dotState === "hollow" ? (
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            border: `1.5px solid ${text.tertiary}`,
            flex: "none",
            boxSizing: "border-box",
          }}
        />
      ) : (
        <StateDot state={dotState} />
      )}
      <span style={{ fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
            {PROVIDER_BRAND[p.name] && (
              <img src={PROVIDER_BRAND[p.name].icon} alt="" width={20} height={20} style={{ borderRadius: 5, flex: "none" }} />
            )}
            {p.label}
          </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }} className="wt-provider-meta">
        <span
          style={{
            color: statusColor,
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          {statusText}
        </span>
        {selfHosted && (
          <span style={{ color: text.tertiary, fontSize: 12, whiteSpace: "nowrap", border: `1px solid ${surface.border}`, borderRadius: 4, padding: "0 6px" }}>
            {t("selfHosted")}
          </span>
        )}
      </span>
      {/* Compact quota: label + conditional progress bar (only when a ratio
          honestly exists), then a quiet meta line. */}
      {quota && quota.supported && (
        <ProviderQuotaInline t={t} quota={quota} />
      )}
      {isDefault && (
        <span style={{ color: accentText(), fontSize: 11, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px", whiteSpace: "nowrap" }}>
          {t("defaultProviderLabel")}
        </span>
      )}
      {orderRank !== undefined && !isDefault && (
        <span style={{ color: text.tertiary, fontSize: 12, whiteSpace: "nowrap" }}>#{orderRank}</span>
      )}
      <IconChevronRightOutline14 size={14} />
    </div>
  );
}

/** Inline quota summary for the provider card: label + bar when computable. */
function ProviderQuotaInline(props: { t: TFunc; quota: QuotaView }) {
  const { t, quota } = props;
  const kind = quotaDisplayKind(quota);
  const fraction = quotaFraction(quota);

  // Unsupported / self-hosted / unlimited: one quiet line, nothing else.
  if (kind === "unavailable") {
    return <span style={{ color: text.tertiary, fontSize: 11, whiteSpace: "nowrap" }}>{t("quotaUnavailable")}</span>;
  }
  if (kind === "self_hosted") {
    return <span style={{ color: text.tertiary, fontSize: 11, whiteSpace: "nowrap" }}>{t("quotaSelfHostedShort")}</span>;
  }
  if (kind === "unlimited") {
    return <span style={{ color: text.secondary, fontSize: 11, whiteSpace: "nowrap" }}>{t("quotaUnlimited")}</span>;
  }

  const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || t("quotaUnavailable");
  const meta = quotaMetaLine(t, quota);
  // Fill stays GREEN = remaining share; the gray track under it = used share.
  const fillColor = stateColor.success;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 120, alignItems: "flex-end", textAlign: "right" }} className="wt-provider-quota">
      <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
        <span style={{ color: text.secondary, fontSize: 12, whiteSpace: "nowrap" }}>{label}</span>
        {fraction !== undefined && (
          <span style={{ color: fillColor, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{Math.round(fraction * 100)}%</span>
        )}
      </span>
      {fraction !== undefined && (
        <span style={{ width: 140, height: 4, borderRadius: 2, background: surface.layer2, overflow: "hidden", display: "block" }}>
          <span style={{ width: `${fraction * 100}%`, height: "100%", background: fillColor, display: "block" }} />
        </span>
      )}
      {meta && <span style={{ color: text.tertiary, fontSize: 10, whiteSpace: "nowrap" }}>{meta}</span>}
    </span>
  );
}

function accentText(): string {
  return "var(--dsw-alias-brand-primary)";
}

/** Test Search block: one input + real run + human-readable timeline. */
function TestSearchBlock(props: { t: TFunc; config: ConfigView; onError: (msg: string) => void }) {
  const { t, config, onError } = props;
  const [query, setQuery] = useState("DeepSeek Harness");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestSearchView | null>(null);
  const [cleared, setCleared] = useState(false);

  const run = async () => {
    if (!query.trim()) return;
    setTesting(true);
    setCleared(false);
    try {
      const r = await api.testSearch(query);
      setResult(r);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const attempts = result?.attempts ?? [];
  const label = (name: string) => config.providers.find((p) => p.name === name)?.label ?? name;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Input
            value={query}
            icon={<IconSearchOutline16 size={14} />}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
          />
        </div>
        <Button variant="primary" size="md" onClick={() => void run()} disabled={testing || !query.trim()}>
          {testing ? t("searching") : t("search")}
        </Button>
      </div>

      {result && !cleared && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Result headline */}
          {result.ok ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: stateColor.success, fontSize: 13 }}>
              <StateDot state="done" size={8} />
              <span style={{ fontWeight: 600 }}>
                {label(result.backend ?? "")} · {result.latencyMs}ms · {t("resultCount", { n: result.resultCount ?? 0 })}
              </span>
              <span style={{ marginLeft: "auto" }}>
                <Button size="sm" variant="ghost" onClick={() => setCleared(true)}>{t("clearResult")}</Button>
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: stateColor.danger, fontSize: 13 }}>
              <StateDot state="error" size={8} />
              <span style={{ fontWeight: 600 }}>{result.error?.message ?? t("unknownOutcome")}</span>
              <span style={{ marginLeft: "auto" }}>
                <Button size="sm" variant="ghost" onClick={() => setCleared(true)}>{t("clearResult")}</Button>
              </span>
            </div>
          )}

          {/* Human-readable attempts timeline */}
          {attempts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: text.secondary }}>
              {attempts.map((a, i) => {
                const ok = a.outcome === "success";
                const skipped = a.outcome.startsWith("skipped-");
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 14, color: text.tertiary }}>{i + 1}.</span>
                    <span style={{ color: text.primary, fontWeight: 500 }}>{label(a.provider)}</span>
                    <span style={{ color: ok ? stateColor.success : skipped ? text.tertiary : stateColor.danger }}>
                      {outcomeLabel(t, a.outcome)}
                    </span>
                    {a.latencyMs !== undefined && <span style={{ color: text.tertiary }}>{a.latencyMs}ms</span>}
                    {i < attempts.length - 1 && <span style={{ marginLeft: "auto", color: text.tertiary }}>↓</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Result links */}
          {result.ok && (result.results ?? []).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(result.results ?? []).slice(0, 5).map((r, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 6, borderTop: `1px solid ${surface.border}` }}>
                  <a href={r.url} target="_blank" rel="noreferrer" style={{ color: accentText(), textDecoration: "none", fontSize: 13 }}>
                    {r.title}
                  </a>
                  <span style={{ color: text.tertiary, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.snippet}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The page. */
export function WebToolsSection(props: SectionProps) {
  const { t: baseT, ui } = props;
  const [config, setConfig] = useState<ConfigView | null>(null);
  // Independent page language: "auto" follows the DSH UI language, "zh"/"en"
  // force the page — persisted in the plugin's own config, never the DSH-wide
  // preference. The local `t` shadows props.t so every child translation
  // (ProviderModal/RoutingModal included) rides the effective language.
  const [uiPref, setUiPref] = useState<UiLangPref>("auto");
  const [dshActive, setDshActive] = useState<string>(() => ui?.getActiveLocale() ?? "zh");
  // Follow DSH-wide locale switches while the preference is "auto".
  useEffect(() => {
    if (!ui) return;
    return ui.subscribeLocale(() => setDshActive(ui.getActiveLocale()));
  }, [ui]);
  // Adopt the persisted preference once the config loads (and after saves).
  useEffect(() => {
    if (config) setUiPref(config.uiLanguage ?? "auto");
  }, [config]);
  const effectiveLang = resolveUiLanguage(uiPref, dshActive);
  const t: TFunc = useMemo(() => {
    if (!ui) return baseT;
    const dict = effectiveLang === "en" ? ui.enDict : ui.zhDict;
    const fallback = effectiveLang === "en" ? ui.zhDict : ui.enDict;
    return (key: string, ...args: unknown[]) => {
      const params = args[0] as Record<string, unknown> | undefined;
      return translateDict(dict, fallback, key, params) ?? baseT(key, ...args);
    };
  }, [ui, effectiveLang, baseT]);
  const [quotas, setQuotas] = useState<Record<string, QuotaView> | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [providerTestResults, setProviderTestResults] = useState<Record<string, TestProviderView>>({});
  const [busyProviders, setBusyProviders] = useState<Record<string, boolean>>({});
  // Main-page drag-to-reorder over the search chain (HTML5 DnD).
  const dragName = useRef<string | null>(null);
  const [dragOverName, setDragOverName] = useState<string | null>(null);
  // Optimistic chain order while a drag-save is in flight; cleared once the
  // persisted config reload lands so the server truth takes over.
  const [localProviderOrder, setLocalProviderOrder] = useState<string[] | null>(null);
  const loadToken = useRef(0);
  const mounted = useRef(true);

  const load = async () => {
    const token = ++loadToken.current;
    try {
      const cfg = await api.configGet();
      if (token !== loadToken.current) return;
      setConfig(cfg);
      setLocalProviderOrder(null); // persisted truth confirmed → drop optimism
      setError("");
    } catch (e) {
      if (token === loadToken.current) setError(e instanceof Error ? e.message : String(e));
    }
  };

  const loadQuotas = async (force = false) => {
    try {
      const quota = await api.quotaDescribe(force);
      if (!mounted.current) return;
      setQuotas(quota.quotas);
    } catch {
      // display-only; never disturb the page
    }
  };

  useEffect(() => {
    void load();
    void loadQuotas();
    return () => {
      loadToken.current += 1;
      mounted.current = false;
    };
  }, []);

  if (!config) {
    return (
      <div style={{ padding: "12px 0", color: text.tertiary, fontSize: 14 }}>
        {error ? `${t("webToolsError")}: ${error}` : t("loading")}
      </div>
    );
  }

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api.configSave(patch);
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const setEnabled = (enabled: boolean) => void save({ enabled });
  const toggleProvider = (name: string, enabled: boolean) => {
    const providerEnabled = Object.fromEntries(config.providers.map((p) => [p.name, p.name === name ? enabled : p.enabled]));
    void save({ providerEnabled });
  };
  const setBaseUrl = (name: string, baseUrl: string) => {
    const providerBaseUrls = { ...(config.providers.reduce((a, p) => ({ ...a, [p.name]: p.baseUrl ?? "" }), {})) };
    providerBaseUrls[name] = baseUrl;
    void save({ providerBaseUrls });
  };
  const setAttemptTimeout = (v: number) => void save({ providerAttemptTimeoutMs: Math.min(60000, Math.max(1000, v)) });

  // One ordered list: [defaultProvider, ...fallbackOrder] — Host schema unchanged.
  const orderedProviders = [
    config.defaultProvider,
    ...config.fallbackOrder.filter((n) => n !== config.defaultProvider),
  ];
  const providerOf = (name: string) => config.providers.find((p) => p.name === name);
  const enabledNames = new Set(config.providers.filter((p) => p.enabled).map((p) => p.name));
  const saveOrder = (ordered: string[]) => {
    const next = ordered.filter((n, i) => ordered.indexOf(n) === i);
    const first = next[0] ?? config.defaultProvider;
    void save({ defaultProvider: first, fallbackOrder: next.slice(1) });
  };

  // Drag-to-reorder on the main page: only chain members are draggable; a
  // drop reorders within the chain (fallbackOrder stays [default, ...rest]).
  const reorderOnDrop = (dragged: string, over: string) => {
    if (dragged === over) return;
    const next = [...orderedProviders];
    const from = next.indexOf(dragged);
    const to = next.indexOf(over);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragged);
    // Optimistic local order so cards re-render instantly; the persisted
    // config reload confirms it (or reverts on failure).
    setLocalProviderOrder(next);
    saveOrder(next);
  };

  // Rendering order: chain members first (in search order), then providers
  // outside the chain (registry order). Falls back to the persisted chain
  // while no drag is in flight.
  const renderedProviders = (localProviderOrder ?? orderedProviders)
    .map((name) => providerOf(name))
    .filter((x): x is ProviderView => x !== undefined)
    .concat(config.providers.filter((p) => !orderedProviders.includes(p.name)));

  const readyCount = config.providers.filter((p) => {
    if (!p.enabled) return false;
    const inChain = orderedProviders.includes(p.name);
    return providerStatusOf(p, quotas?.[p.name], inChain) === "ready";
  }).length;

  const testProvider = async (provider: string) => {
    setBusyProviders((b) => ({ ...b, [provider]: true }));
    try {
      const r = await api.testProvider(provider, "OpenAI");
      setProviderTestResults((prev) => ({ ...prev, [provider]: r }));
    } catch (e) {
      setProviderTestResults((prev) => ({
        ...prev,
        [provider]: { ok: false, error: { code: "error", message: e instanceof Error ? e.message : String(e) } },
      }));
    } finally {
      setBusyProviders((b) => ({ ...b, [provider]: false }));
    }
  };

  const detailProvider = detailFor !== null ? providerOf(detailFor) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 720, padding: "4px 0 24px" }}>
      {/* Narrow-width responsive rules: provider rows wrap to two lines. */}
      <style>{`
        @media (max-width: 640px) {
          .wt-provider-row { flex-wrap: wrap; row-gap: 4px; }
          .wt-provider-meta { flex-basis: 100%; order: 10; padding-left: 22px; }
        }
      `}</style>
      {/* Header: title + enabled switch */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: "28px", color: text.primary }}>{t("title")}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "22px", color: text.secondary }}>{t("tagline")}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 2, flex: "none", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Page language: independent of the DSH-wide locale (persisted in
              the plugin config; "auto" follows the DSH UI language). */}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: text.secondary, whiteSpace: "nowrap" }}>
            <span>{t("uiLanguage")}</span>
            <select
              value={uiPref}
              onChange={(e) => {
                const v = e.target.value as UiLangPref;
                setUiPref(v);
                void save({ uiLanguage: v });
              }}
              style={{
                padding: "4px 8px",
                borderRadius: 8,
                border: `1px solid ${surface.border}`,
                background: surface.layer2,
                color: text.primary,
                fontFamily: "inherit",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <option value="auto">{t("uiLangAuto")}</option>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <Switch checked={config.enabled} onChange={setEnabled} label={config.enabled ? t("enabledLabel") : t("disabledLabel")} />
          {saving && <span style={{ color: text.tertiary, fontSize: 12 }}>{t("saving")}</span>}
          {saved && !saving && <span style={{ color: stateColor.success, fontSize: 12 }}>{t("saved")}</span>}
        </div>
      </div>

      {error && <div style={{ color: stateColor.danger, fontSize: 13 }}>{error}</div>}

      {/* Proxy degraded warning: a proxy is configured but undici is missing,
          so provider calls fall back to direct fetch and may time out. */}
      {config.proxy?.configured === true && config.proxy?.degraded === true && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "10px 14px",
            borderRadius: 12,
            border: `1px solid ${stateColor.warning}`,
            background: surface.layer1,
            fontSize: 13,
            color: text.secondary,
          }}
        >
          <strong style={{ color: stateColor.warning, fontSize: 13 }}>{t("proxyDegradedTitle")}</strong>
          <span>{t("proxyDegradedBody")}</span>
        </div>
      )}

      {/* Summary strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 14px",
          borderRadius: 12,
          background: surface.layer1,
          border: `1px solid ${surface.border}`,
          fontSize: 13,
          color: text.secondary,
          flexWrap: "wrap",
        }}
      >
        <span>
          {t("readySummary", { n: readyCount, total: config.providers.length })}
        </span>
        <span style={{ color: surface.border }}>|</span>
        <span>
          {t("defaultProviderLabel")}: <strong style={{ color: text.primary }}>{providerOf(config.defaultProvider)?.label ?? config.defaultProvider}</strong>
        </span>
      </div>

      {/* Search order summary + edit */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: text.primary }}>{t("orderLabel")}</h3>
          <span style={{ color: text.tertiary, fontSize: 12 }}>{t("orderHint")}</span>
          <span style={{ marginLeft: "auto" }}>
            <Button size="sm" variant="ghost" icon={<IconEditOutline16 size={14} />} onClick={() => setRoutingOpen(true)}>
              {t("editOrder")}
            </Button>
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            padding: "10px 14px",
            borderRadius: 12,
            background: surface.layer1,
            border: `1px solid ${surface.border}`,
            fontSize: 13,
          }}
        >
          {orderedProviders.length === 0 && <span style={{ color: text.tertiary }}>{t("notConfigured")}</span>}
          {orderedProviders.map((name, i) => {
            const p = providerOf(name);
            const ok = p !== undefined && enabledNames.has(name);
            return (
              <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <span style={{ color: text.tertiary }}>→</span>}
                <span style={{ color: ok ? text.primary : text.tertiary, fontWeight: i === 0 ? 600 : 400 }}>
                  {p?.label ?? name}
                </span>
                {i === 0 && (
                  <span style={{ color: accentText(), fontSize: 11, fontWeight: 600 }}>{t("defaultProviderLabel")}</span>
                )}
              </span>
            );
          })}
        </div>
      </section>

      {/* Providers: card list, chain members drag-to-reorder */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: text.primary }}>{t("providersLabel")}</h3>
          <span style={{ color: text.tertiary, fontSize: 12 }}>{t("orderHint")}</span>
          <span style={{ marginLeft: "auto" }}>
            <Button size="sm" variant="ghost" icon={<IconEditOutline16 size={14} />} onClick={() => setRoutingOpen(true)}>
              {t("editOrder")}
            </Button>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {renderedProviders.map((p) => {
            const inChain = orderedProviders.includes(p.name);
            const testResult = providerTestResults[p.name];
            return (
              <ProviderCard
                key={p.name}
                t={t}
                p={p}
                quota={quotas?.[p.name]}
                testResult={testResult}
                orderRank={inChain ? orderedProviders.indexOf(p.name) + 1 : undefined}
                isDefault={p.name === config.defaultProvider}
                draggable={inChain}
                isDragOver={dragOverName === p.name && dragName.current !== null && dragName.current !== p.name}
                onClick={() => setDetailFor(p.name)}
                onDragStart={(e) => {
                  dragName.current = p.name;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", p.name);
                }}
                onDragOver={(e) => {
                  if (!inChain || dragName.current === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverName !== p.name) setDragOverName(p.name);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dragged = dragName.current;
                  dragName.current = null;
                  setDragOverName(null);
                  if (dragged !== null) reorderOnDrop(dragged, p.name);
                }}
                onDragEnd={() => {
                  dragName.current = null;
                  setDragOverName(null);
                }}
              />
            );
          })}
        </div>
      </section>

      {/* Test search */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: text.primary }}>{t("testSearchTitle")}</h3>
        <TestSearchBlock t={t} config={config} onError={(msg) => setError(msg)} />
      </section>

      {/* Advanced */}
      <details style={{ fontSize: 13 }}>
        <summary style={{ cursor: "pointer", color: text.secondary, fontSize: 13, padding: "4px 0" }}>
          {t("advanced")}
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ color: text.secondary }}>{t("attemptTimeoutLabel")}</label>
            <input
              type="number"
              min={1000}
              max={60000}
              step={1000}
              value={config.providerAttemptTimeoutMs}
              onChange={(e) => setAttemptTimeout(Number(e.target.value))}
              style={{
                width: 90,
                padding: "4px 8px",
                borderRadius: 6,
                border: `1px solid ${surface.border}`,
                background: surface.layer2,
                color: text.primary,
                fontFamily: "inherit",
                fontSize: 13,
              }}
            />
            <span style={{ color: text.tertiary, fontSize: 12 }}>{t("attemptTimeoutHint")} ({t("seconds", { n: Math.round(config.providerAttemptTimeoutMs / 1000) })})</span>
          </div>
        </div>
      </details>

      {/* Provider detail dialog */}
      {detailProvider && (
        <ProviderModal
          t={t}
          p={detailProvider}
          quota={quotas?.[detailProvider.name]}
          testResult={providerTestResults[detailProvider.name]}
          busy={!!busyProviders[detailProvider.name]}
          isDefault={detailProvider.name === config.defaultProvider}
          inChain={orderedProviders.includes(detailProvider.name)}
          onClose={() => { setDetailFor(null); setProviderTestResults((prev) => { const next = { ...prev }; delete next[detailProvider.name]; return next; }); }}
          onToggle={(enabled) => toggleProvider(detailProvider.name, enabled)}
          onBaseUrl={(url) => setBaseUrl(detailProvider.name, url)}
          onTest={() => testProvider(detailProvider.name)}
          onRefreshQuota={() => void loadQuotas(true)}
          onConfigChanged={() => {
            // Credentials changed (add/remove key): drop the stale probe so a
            // previous "no key" / auth error does not linger after the edit.
            setProviderTestResults((prev) => { const next = { ...prev }; delete next[detailProvider.name]; return next; });
            void load();
          }}
        />
      )}

      {/* Routing dialog */}
      {routingOpen && (
        <RoutingModal
          t={t}
          providers={config.providers}
          ordered={orderedProviders}
          onClose={() => setRoutingOpen(false)}
          onSave={saveOrder}
        />
      )}
    </div>
  );
}
