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
import { api, type ConfigView, type QuotaView, type TestProviderView, type TestSearchView, type ProviderView, type SearchRoutingPolicy } from "./api.ts";
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
  quotaTier,
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

/** One compact quota + status display in the provider row.
 *  Normal: silent (no green dots or 'ready' text); displays honest quota summary + micro progress bar when available.
 *  Abnormal / Non-ready: displays status dot + issue text. */
function ProviderRowRight(props: {
  t: TFunc;
  status: ProviderStatus;
  statusText: string;
  dotState: "done" | "warning" | "error" | "ongoing" | "hollow";
  statusColor: string;
  quota?: QuotaView;
}) {
  const { t, status, statusText, dotState, statusColor, quota } = props;

  // Abnormal / disabled / unconfigured states speak up with status dot & text.
  if (status !== "ready") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}>
        {dotState === "hollow" ? (
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${text.tertiary}`, flex: "none", boxSizing: "border-box" }} />
        ) : (
          <StateDot state={dotState} size={8} />
        )}
        <span style={{ color: statusColor, fontSize: 12, whiteSpace: "nowrap" }}>
          {statusText}
        </span>
      </span>
    );
  }

  // Ready / healthy state: stay quiet, show quota if available.
  const summary = quotaSummary(t, quota);
  const fraction = quotaFraction(quota);
  const tier = quotaTier(fraction);
  const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : text.tertiary;

  if (!summary && fraction === undefined) {
    return null;
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }}>
      {summary && (
        <span style={{ color: text.secondary, fontSize: 12, whiteSpace: "nowrap" }}>
          {summary}
        </span>
      )}
      {fraction !== undefined && (
        <div style={{ width: 64, height: 3, borderRadius: 2, background: surface.layer2, overflow: "hidden", flex: "none" }}>
          <div style={{ width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .2s ease" }} />
        </div>
      )}
    </span>
  );
}

/** One provider row inside the unified ProviderGroup list. */
function ProviderRow(props: {
  t: TFunc;
  p: ProviderView;
  quota?: QuotaView;
  testResult?: TestProviderView;
  /** Whether this provider is in the routing order (default + fallback). */
  inOrder: boolean;
  /** Show the "首选" text — only for the first entry in ordered policy. */
  showPreferred: boolean;
  isLast: boolean;
  onClick: () => void;
}) {
  const { t, p, quota, testResult, inOrder, showPreferred, isLast, onClick } = props;
  const base = providerStatusOf(p, quota, inOrder);
  const status = base === "ready" ? (testOutcomeStatus(testResult) ?? base) : base;
  const statusText = {
    ready: t("ready"),
    "rate-limited": t("rateLimited"),
    "auth-error": t("authError"),
    "unreachable": t("unreachable"),
    "not-configured": t("notConfigured"),
    "disabled": t("disabled"),
    "not-in-order": t("notInOrder"),
  }[status];
  const dotState: "done" | "warning" | "error" | "ongoing" | "hollow" =
    status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
  const statusColor = status === "ready" ? stateColor.success : status === "auth-error" ? stateColor.danger : status === "rate-limited" || status === "unreachable" ? stateColor.warning : text.tertiary;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "10px 14px",
        background: "transparent",
        borderBottom: isLast ? "none" : `1px solid ${surface.border}`,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 14,
        color: text.primary,
        textAlign: "left",
        boxSizing: "border-box",
        transition: "background .12s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = surface.hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {PROVIDER_BRAND[p.name] && (
        <img src={PROVIDER_BRAND[p.name].icon} alt="" width={22} height={22} style={{ borderRadius: 5, flex: "none" }} />
      )}
      <span style={{ fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "none" }}>
        {p.label}
      </span>
      {showPreferred && (
        <span style={{ color: text.tertiary, fontSize: 12, fontWeight: 400, whiteSpace: "nowrap" }}>
          {t("preferredProviderLabel")}
        </span>
      )}
      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }}>
        <ProviderRowRight
          t={t}
          status={status}
          statusText={statusText}
          dotState={dotState}
          statusColor={statusColor}
          quota={quota}
        />
        <span style={{ color: text.tertiary, display: "inline-flex", alignItems: "center" }}>
          <IconChevronRightOutline14 size={14} />
        </span>
      </span>
    </div>
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
                {t("usingProviderPrefix")}{label(result.backend ?? "")} · {(result.latencyMs / 1000).toFixed(2)} {t("secondsUnit")} · {t("resultCount", { n: result.resultCount ?? 0 })}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: text.secondary }}>
              {attempts.map((a, i) => {
                const ok = a.outcome === "success";
                const skipped = a.outcome.startsWith("skipped-");
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 14, color: text.tertiary }}>{i + 1}.</span>
                    <span style={{ color: text.primary, fontWeight: 500, minWidth: 60 }}>{label(a.provider)}</span>
                    <span style={{ color: ok ? stateColor.success : skipped ? text.tertiary : stateColor.danger, minWidth: 70 }}>
                      {outcomeLabel(t, a.outcome)}
                    </span>
                    {a.latencyMs !== undefined && (
                      <span style={{ color: text.tertiary, marginLeft: "auto" }}>
                        {(a.latencyMs / 1000).toFixed(1)} {t("secondsUnit")}
                      </span>
                    )}
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
  const [dshActive, setDshActive] = useState<string>(() => ui?.getActiveLocale() ?? "zh");
  // Follow DSH-wide locale switches directly — the page always mirrors DSH.
  useEffect(() => {
    if (!ui) return;
    return ui.subscribeLocale(() => setDshActive(ui.getActiveLocale()));
  }, [ui]);
  const effectiveLang = dshActive === "en" ? "en" : "zh";
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
  const [timeoutDraftSec, setTimeoutDraftSec] = useState<string>("");
  const loadToken = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    if (config?.providerAttemptTimeoutMs !== undefined) {
      setTimeoutDraftSec(String(Math.round(config.providerAttemptTimeoutMs / 1000)));
    }
  }, [config?.providerAttemptTimeoutMs]);

  const load = async () => {
    const token = ++loadToken.current;
    try {
      const cfg = await api.configGet();
      if (token !== loadToken.current) return;
      setConfig(cfg);
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

  const commitTimeoutSec = (secStr: string) => {
    const num = Number(secStr);
    if (!Number.isFinite(num) || num <= 0) {
      if (config) setTimeoutDraftSec(String(Math.round(config.providerAttemptTimeoutMs / 1000)));
      return;
    }
    const ms = Math.min(60000, Math.max(1000, Math.round(num * 1000)));
    setTimeoutDraftSec(String(Math.round(ms / 1000)));
    if (!config || ms !== config.providerAttemptTimeoutMs) {
      void save({ providerAttemptTimeoutMs: ms });
    }
  };

  // One ordered list: [defaultProvider, ...fallbackOrder] — Host schema unchanged.
  const orderedProviders = [
    config.defaultProvider,
    ...config.fallbackOrder.filter((n) => n !== config.defaultProvider),
  ];
  const providerOf = (name: string) => config.providers.find((p) => p.name === name);
  const enabledNames = new Set(config.providers.filter((p) => p.enabled).map((p) => p.name));
  const saveOrder = (ordered: string[], policy: SearchRoutingPolicy = config.searchRoutingPolicy ?? "ordered") => {
    const next = ordered.filter((n, i) => ordered.indexOf(n) === i);
    void api.routingSet(policy, next).then(() => load()).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  // Rendering order: providers are listed in the routing order (default +
  // fallback), then providers outside the chain (registry order).
  const renderedProviders = orderedProviders
    .map((name) => providerOf(name))
    .filter((x): x is ProviderView => x !== undefined)
    .concat(config.providers.filter((p) => !orderedProviders.includes(p.name)));

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

  // "首选" is only meaningful when the policy is ordered — round-robin and
  // random have no fixed first entry.
  const showPreferredFor = (name: string) =>
    (config.searchRoutingPolicy ?? "ordered") === "ordered" && name === config.defaultProvider;

  const detailProvider = detailFor !== null ? providerOf(detailFor) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720, padding: "4px 0 24px" }}>
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
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, lineHeight: "24px", color: text.primary }}>{t("title")}</h2>
          <p style={{ margin: "2px 0 0", fontSize: 14, lineHeight: "22px", color: text.tertiary }}>{t("tagline")}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 2, flex: "none", flexWrap: "wrap", justifyContent: "flex-end" }}>
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

      {/* 搜索顺序 (compact routing summary row) */}
      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: text.primary }}>{t("routingLabel")}</h3>
          <button
            type="button"
            onClick={() => setRoutingOpen(true)}
            title={t("routingConfigure")}
            aria-label={t("routingConfigure")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
              color: text.secondary,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = surface.hover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <IconEditOutline16 size={14} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: text.secondary, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ color: text.tertiary }}>{t(`routingPolicy.${config.searchRoutingPolicy ?? "ordered"}`)} ·</span>
          <span>
            {(() => {
              const names = orderedProviders.map((name) => providerOf(name)?.label ?? name);
              const separator = (config.searchRoutingPolicy ?? "ordered") === "random" ? (t("save") === "保存" ? "、" : ", ") : " → ";
              if (names.length <= 3) {
                return names.join(separator);
              }
              const head = names.slice(0, 3).join(separator);
              return `${head} · +${names.length - 3}`;
            })()}
          </span>
        </div>
      </section>

      {/* Providers: unified group container */}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: text.primary }}>{t("providersLabel")}</h3>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: surface.layer1,
            border: `1px solid ${surface.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {renderedProviders.map((p, idx) => {
            const testResult = providerTestResults[p.name];
            return (
              <ProviderRow
                key={p.name}
                t={t}
                p={p}
                quota={quotas?.[p.name]}
                testResult={testResult}
                inOrder={orderedProviders.includes(p.name)}
                showPreferred={showPreferredFor(p.name)}
                isLast={idx === renderedProviders.length - 1}
                onClick={() => setDetailFor(p.name)}
              />
            );
          })}
        </div>
      </section>

      {/* 诊断与更多设置 */}
      <details style={{ fontSize: 13, borderTop: `1px solid ${surface.border}`, paddingTop: 12, marginTop: 4 }}>
        <summary style={{ cursor: "pointer", color: text.secondary, fontSize: 13, fontWeight: 500, padding: "4px 0" }}>
          {t("diagnosticsAndMore")}
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 0 0" }}>
          {/* Timeout */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ color: text.secondary, fontSize: 13 }}>{t("attemptTimeoutLabel")}</label>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="number"
                min={1}
                max={60}
                step={1}
                value={timeoutDraftSec}
                onChange={(e) => setTimeoutDraftSec(e.target.value)}
                onBlur={() => commitTimeoutSec(timeoutDraftSec)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                style={{
                  width: 64,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: `1px solid ${surface.border}`,
                  background: surface.layer2,
                  color: text.primary,
                  fontFamily: "inherit",
                  fontSize: 13,
                }}
              />
              <span style={{ color: text.secondary, fontSize: 13 }}>{t("secondsUnit")}</span>
            </div>
            <span style={{ color: text.tertiary, fontSize: 12 }}>
              {t("attemptTimeoutHint")}
            </span>
          </div>

          {/* Test search */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: text.primary }}>{t("testSearchTitle")}</span>
            <TestSearchBlock t={t} config={config} onError={(msg) => setError(msg)} />
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
          showPreferred={showPreferredFor(detailProvider.name)}
          inChain={orderedProviders.includes(detailProvider.name)}
          onClose={() => { setDetailFor(null); setProviderTestResults((prev) => { const next = { ...prev }; delete next[detailProvider.name]; return next; }); }}
          onToggle={(enabled) => toggleProvider(detailProvider.name, enabled)}
          onBaseUrl={(url) => setBaseUrl(detailProvider.name, url)}
          onTest={() => testProvider(detailProvider.name)}
          onRefreshQuota={() => void loadQuotas(true)}
          onConfigChanged={async () => {
            // Credentials or preferences changed: drop the stale probe so a
            // previous "no key" / auth error does not linger after the edit.
            setProviderTestResults((prev) => { const next = { ...prev }; delete next[detailProvider.name]; return next; });
            await load();
          }}
        />
      )}

      {/* Routing dialog */}
      {routingOpen && (
        <RoutingModal
          t={t}
          providers={config.providers}
          ordered={orderedProviders}
          currentPolicy={config.searchRoutingPolicy ?? "ordered"}
          onClose={() => setRoutingOpen(false)}
          onSave={saveOrder}
        />
      )}
    </div>
  );
}
