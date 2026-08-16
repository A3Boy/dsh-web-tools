/**
 * dsh-web-tools — main settings card (settings.plugin.item slot).
 *
 * Layout:
 *   Web Search (enabled toggle)
 *   ├─ 默认搜索引擎 [Tavily ▾]
 *   ├─ 搜索结果数量 / 超时
 *   ├─ Fallback 顺序 (Exa → Firecrawl → ...)
 *   ├─ Providers (每张卡片: 状态/额度/测试连接/配置 key 池)
 *   └─ 测试搜索 (真实跑一次)
 *
 * Model-facing tools stay `web_search`/`web_fetch` — this card only manages
 * the Host provider configuration.
 * @module
 */
import { useEffect, useRef, useState } from "react";
import { api, type ConfigView, type QuotaView, type TestSearchView, type TestProviderView, type ProviderView } from "./api.ts";

interface CardProps {
  /** locale copy injected by the card slot (minimal set). */
  locale?: Record<string, string>;
}

/** UI copy dictionary (zh/en) — the card renders in the DSH UI language. */
const COPY = {
  zh: {
    title: "Web Search",
    enabled: "已启用",
    disabled: "已禁用",
    saving: "保存中…",
    saved: "已保存",
    attemptTimeoutLabel: "单 Provider 超时 (ms)",
    attemptTimeoutHint: "单个搜索源最多等待多久，超时后切换下一家（总超时由 DSH 工具层控制）",
    priorityTitle: "搜索优先级",
    priorityHint: "第一项为默认 Provider，其余按顺序用于故障切换",
    defaultBadge: "默认",
    disabledBadge: "Disabled",
    moveUp: "上移",
    moveDown: "下移",
    remove: "移出优先级（不禁用 Provider）",
    addProvider: "+ 添加 Provider",
    available: "可添加",
    effectiveOrder: "Effective order",
    providers: "Providers",
    keyConfigured: "● configured",
    keyNotConfigured: "○ no key",
    keyHint: "已配置 Key",
    keyCount: (n: number) => `共 ${n} 把`,
    refreshQuota: "刷新额度",
    resetLabel: "重置",
    usageLabel: "消耗",
    requestsRemaining: "剩余请求",
    updatedAgo: (mins: number) => `更新于 ${mins} 分钟前`,
    updatedJustNow: "刚刚更新",
    baseUrlLabel: "Base URL",
    apiKeyLabel: "API Key",
    apiKeyPool: (n: number) => `s (池 x${n})`,
    apiKeyPlaceholderSet: "已配置 (多个 key 用逗号分隔，留空保存可清空)",
    apiKeyPlaceholderUnset: "未配置 (多个 key 用逗号分隔)",
    saveBtn: "Save",
    testBtn: "Test",
    testOk: "连接成功",
    testFail: "连接失败",
    testSearchTitle: "测试搜索",
    searchPlaceholder: "输入查询…",
    searching: "Searching…",
    search: "Search",
    clearResult: "清空",
    resultCount: (n: number) => `${n} 结果`,
    attempts: "尝试",
    loading: "Loading Web Tools configuration…",
    webToolsError: "Web Tools",
  },
  en: {
    title: "Web Search",
    enabled: "Enabled",
    disabled: "Disabled",
    saving: "saving…",
    saved: "saved",
    attemptTimeoutLabel: "Per-provider timeout (ms)",
    attemptTimeoutHint: "How long one provider may run before switching to the next (overall timeout owned by the DSH tool layer)",
    priorityTitle: "Search priority",
    priorityHint: "First entry is the default provider; the rest are tried in order on failure",
    defaultBadge: "default",
    disabledBadge: "Disabled",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Remove from priority (provider stays enabled)",
    addProvider: "+ Add provider",
    available: "Available",
    effectiveOrder: "Effective order",
    providers: "Providers",
    keyConfigured: "● configured",
    keyNotConfigured: "○ no key",
    keyHint: "Configured key",
    keyCount: (n: number) => `${n} total`,
    refreshQuota: "Refresh quota",
    resetLabel: "Reset",
    usageLabel: "Usage",
    requestsRemaining: "requests remaining",
    updatedAgo: (mins: number) => `Updated ${mins} min ago`,
    updatedJustNow: "Updated just now",
    baseUrlLabel: "Base URL",
    apiKeyLabel: "API Key",
    apiKeyPool: (n: number) => `s (pool x${n})`,
    apiKeyPlaceholderSet: "Configured (comma-separated; empty save clears)",
    apiKeyPlaceholderUnset: "Not configured (comma-separated)",
    saveBtn: "Save",
    testBtn: "Test",
    testOk: "Connected",
    testFail: "Connection failed",
    testSearchTitle: "Test Search",
    searchPlaceholder: "Enter a query…",
    searching: "Searching…",
    search: "Search",
    clearResult: "Clear",
    resultCount: (n: number) => `${n} result(s)`,
    attempts: "Attempts",
    loading: "Loading Web Tools configuration…",
    webToolsError: "Web Tools",
  },
} as const;

type Copy = typeof COPY["zh"];
function detectLang(): "zh" | "en" {
  try {
    const lang = (navigator.language || "en").toLowerCase();
    return lang.startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

export function WebToolsCard(_props: CardProps) {
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [quotas, setQuotas] = useState<Record<string, QuotaView> | null>(null);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<TestSearchView | null>(null);
  const [testQuery, setTestQuery] = useState("DeepSeek Harness");
  const [testing, setTesting] = useState(false);
  // Per-provider connection-test results (separate from Test Search).
  const [providerTestResults, setProviderTestResults] = useState<Record<string, TestProviderView>>({});
  const [busyProviders, setBusyProviders] = useState<Record<string, boolean>>({});
  const loadToken = useRef(0);
  const mounted = useRef(true);
  const [lang, setLang] = useState<"zh" | "en">(detectLang());
  const t = (key: string, ...args: unknown[]): string => {
    const v = COPY[lang][key as keyof Copy];
    return typeof v === "function" ? (v as (...a: unknown[]) => string)(...args) : (v as string);
  };

  // Config loads first (the card renders instantly); quota loads in the
  // background and is cached 5 min on the Host — no 30s polling.
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

  const loadQuotas = async () => {
    try {
      const quota = await api.quotaDescribe();
      if (!mounted.current) return;
      setQuotas(quota.quotas);
    } catch {
      // quota is display-only; failure must not disturb the card
    }
  };

  /** Manual refresh — forces the Host to bypass its 5-min quota cache. */
  const refreshQuotas = async () => {
    try {
      const quota = await api.quotaDescribe(true);
      if (!mounted.current) return;
      setQuotas(quota.quotas);
    } catch {
      // silent: display-only
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
      <div style={{ padding: 12, color: "#888" }}>
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
  // Per-attempt timeout for ONE provider call (overall web_search timeout is
  // owned by the DSH tool layer, so this card does not expose maxResults).
  const setAttemptTimeout = (v: number) => void save({ providerAttemptTimeoutMs: Math.min(60000, Math.max(1000, v)) });
  const toggleProvider = (name: string, enabled: boolean) => {
    const providerEnabled = Object.fromEntries(config.providers.map((p) => [p.name, p.name === name ? enabled : p.enabled]));
    void save({ providerEnabled });
  };
  const setBaseUrl = (name: string, baseUrl: string) => {
    const providerBaseUrls = { ...(config.providers.reduce((a, p) => ({ ...a, [p.name]: p.baseUrl ?? "" }), {})) };
    providerBaseUrls[name] = baseUrl;
    void save({ providerBaseUrls });
  };

  // ---- Search priority view model ----------------------------------------
  // UI edits ONE ordered list: [defaultProvider, ...fallbackOrder].
  // Persisted back as defaultProvider = list[0], fallbackOrder = list.slice(1).
  // The Host schema never changes.
  const orderedProviders = [
    config.defaultProvider,
    ...config.fallbackOrder.filter((n) => n !== config.defaultProvider),
  ];
  const providerOf = (name: string) => config.providers.find((p) => p.name === name);
  const enabledNames = new Set(config.providers.filter((p) => p.enabled).map((p) => p.name));

  const saveOrder = (ordered: string[]) => {
    const next = ordered.filter((n, i) => ordered.indexOf(n) === i); // dedupe
    const first = next[0] ?? config.defaultProvider;
    void save({ defaultProvider: first, fallbackOrder: next.slice(1) });
  };

  const moveOrder = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= orderedProviders.length) return;
    const next = [...orderedProviders];
    [next[index], next[target]] = [next[target], next[index]];
    saveOrder(next);
  };

  const removeFromOrder = (name: string) => {
    // First entry is the default — never removable directly; removing any
    // other entry takes it out of the chain WITHOUT disabling the provider.
    if (orderedProviders[0] === name) return;
    saveOrder(orderedProviders.filter((n) => n !== name));
  };

  const addToOrder = (name: string) => {
    if (orderedProviders.includes(name)) return;
    saveOrder([...orderedProviders, name]);
  };

  const availableToAdd = config.providers
    .filter((p) => p.enabled && !orderedProviders.includes(p.name))
    .map((p) => p.name);

  const saveKey = async (provider: string) => {
    const value = keyDrafts[provider] ?? "";
    setBusyProviders((b) => ({ ...b, [provider]: true }));
    try {
      await api.credentialsSet(provider, value);
      setKeyDrafts((d) => ({ ...d, [provider]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyProviders((b) => ({ ...b, [provider]: false }));
    }
  };

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

  const runTestSearch = async () => {
    setTesting(true);
    try {
      const r = await api.testSearch(testQuery);
      setTestResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong>{t("title")}</strong>
        <button
          onClick={() => setEnabled(!config.enabled)}
          style={{ marginLeft: "auto", padding: "2px 10px" }}
        >
          {t(config.enabled ? "enabled" : "disabled")}
        </button>
        <button onClick={() => setLang(lang === "zh" ? "en" : "zh")} title="切换语言" style={{ padding: "2px 8px" }}>
          {lang === "zh" ? "EN" : "中文"}
        </button>
        {saving && <span style={{ color: "#888" }}>{t("saving")}</span>}
        {saved && !saving && <span style={{ color: "#2c6" }}>{t("saved")}</span>}
      </div>
      {error && <div style={{ color: "#c33" }}>{error}</div>}

      {/* General */}
      <div style={{ border: "1px solid #444", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label>{t("attemptTimeoutLabel")}</label>
          <input
            type="number"
            min={1000}
            max={60000}
            value={config.providerAttemptTimeoutMs}
            onChange={(e) => setAttemptTimeout(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <span style={{ color: "#888", fontSize: 12 }}>{t("attemptTimeoutHint")}</span>
        </div>

        {/* Search priority: one ordered list, first entry = default */}
        <div style={{ borderTop: "1px solid #333", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <strong>{t("priorityTitle")}</strong>
            <span style={{ color: "#888", fontSize: 12 }}>{t("priorityHint")}</span>
          </div>
          {orderedProviders.map((name, i) => {
            const p = providerOf(name);
            const disabled = !p || !enabledNames.has(name);
            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, opacity: disabled ? 0.55 : 1 }}>
                <span style={{ color: "#888", width: 18 }}>{i + 1}.</span>
                <span style={{ fontWeight: i === 0 ? 700 : 400 }}>
                  {p?.label ?? name}
                  {i === 0 && <span style={{ color: "#2c6", fontSize: 11, marginLeft: 6 }}>{t("defaultBadge")}</span>}
                  {disabled && <span style={{ color: "#c33", fontSize: 11, marginLeft: 6 }}>{t("disabledBadge")}</span>}
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button onClick={() => moveOrder(i, -1)} disabled={i === 0} title={t("moveUp")}>↑</button>
                  <button onClick={() => moveOrder(i, 1)} disabled={i === orderedProviders.length - 1} title={t("moveDown")}>↓</button>
                  {i !== 0 && <button onClick={() => removeFromOrder(name)} title={t("remove")}>×</button>}
                </span>
              </div>
            );
          })}
          {availableToAdd.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => addToOrder(availableToAdd[0])}
                disabled={availableToAdd.length === 0}
              >
                {t("addProvider")}
              </button>
              {availableToAdd.length > 1 && (
                <span style={{ color: "#888", fontSize: 12 }}>
                  {t("available")}：{availableToAdd.map((n) => providerOf(n)?.label ?? n).join(" · ")}
                </span>
              )}
            </div>
          )}
          <div style={{ color: "#888", fontSize: 12, borderTop: "1px solid #333", paddingTop: 6 }}>
            {t("effectiveOrder")}：
            {orderedProviders.map((n, i) => {
              const p = providerOf(n);
              const d = !p || !enabledNames.has(n);
              return (
                <span key={n}>
                  {i > 0 && <span style={{ color: "#666" }}> → </span>}
                  <span style={{ color: d ? "#c33" : "#aab4c8" }}>{p?.label ?? n}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Providers */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {config.providers.map((p) => (
          <ProviderRow
            key={p.name}
            provider={p}
            quota={quotas?.[p.name]}
            testResult={providerTestResults[p.name]}
            busy={!!busyProviders[p.name]}
            keyDraft={keyDrafts[p.name] ?? ""}
            t={t}
            onKeyDraft={(v) => setKeyDrafts((d) => ({ ...d, [p.name]: v }))}
            onSaveKey={() => void saveKey(p.name)}
            onTest={() => void testProvider(p.name)}
            onToggle={(enabled) => toggleProvider(p.name, enabled)}
            onBaseUrl={(url) => setBaseUrl(p.name, url)}
            isDefault={p.name === config.defaultProvider}
            onRefreshQuota={() => void refreshQuotas()}
          />
        ))}
      </div>

      {/* Test search */}
      <div style={{ border: "1px solid #444", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong>{t("testSearchTitle")}</strong>
          {testResult && (
            <button onClick={() => setTestResult(null)} style={{ marginLeft: "auto", fontSize: 12, padding: "0 8px" }}>
              {t("clearResult")}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            style={{ flex: 1 }}
            placeholder={t("searchPlaceholder")}
            onKeyDown={(e) => { if (e.key === "Enter") void runTestSearch(); }}
          />
          <button onClick={() => void runTestSearch()} disabled={testing}>
            {testing ? t("searching") : t("search")}
          </button>
        </div>
        {testResult && <TestResultView result={testResult} providers={config.providers} t={t} />}
      </div>
    </div>
  );
}

function ProviderRow(props: {
  key?: string;
  provider: ProviderView;
  quota?: QuotaView;
  testResult?: TestProviderView;
  busy: boolean;
  keyDraft: string;
  t: (key: string, ...args: unknown[]) => string;
  onKeyDraft: (v: string) => void;
  onSaveKey: () => void;
  onTest: () => void;
  onToggle: (enabled: boolean) => void;
  onBaseUrl: (url: string) => void;
  onRefreshQuota: () => void;
  isDefault: boolean;
}) {
  const { provider: p, quota, testResult, busy, keyDraft, t, onKeyDraft, onSaveKey, onTest, onToggle, onBaseUrl, onRefreshQuota, isDefault } = props;
  return (
    <div style={{ border: "1px solid #444", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={p.enabled} onChange={(e) => onToggle(e.target.checked)} />
        <strong>{p.label}</strong>
        <span style={{ color: "#888" }}>{p.description}</span>
        {isDefault && <span style={{ background: "#264", color: "#fff", padding: "0 6px", borderRadius: 4 }}>default</span>}
        <span
          style={{
            marginLeft: "auto",
            color: p.keyConfigured ? "#2c6" : "#c33",
          }}
        >
          {p.keyConfigured ? "● configured" : "○ no key"}
        </span>
      </div>

      {/* Key hint (masked) */}
      {p.keyHint && (
        <div style={{ color: "#888", fontSize: 12 }}>
          {t("keyHint")}: {p.keyHint}{p.poolSize > 1 ? ` · ${p.poolSize} keys` : ""}
        </div>
      )}

      {/* Quota + refresh */}
      {quota && (
        <div style={{ color: "#bbb" }}>
          {quota.supported && quota.authoritative && quota.unit === "credits" && quota.remaining !== undefined && (
            <QuotaBar label={`${quota.remaining} / ${quota.limit ?? "?"} credits`} remaining={quota.remaining} limit={quota.limit} />
          )}
          {quota.supported && quota.authoritative && quota.unit === "requests" && quota.remaining !== undefined && (
            <QuotaBar
              label={`${quota.remaining} ${t("requestsRemaining")}${quota.limit !== undefined ? ` / ${quota.limit}` : ""}`}
              remaining={quota.remaining}
              limit={quota.limit}
            />
          )}
          {quota.supported && quota.authoritative && quota.unit !== "credits" && quota.unit !== "requests" && quota.remaining !== undefined && (
            <div>
              {quota.unit === "usd_cents" ? `$${(quota.remaining / 100).toFixed(2)}` : quota.remaining} {quota.unit}
              {quota.limit !== undefined && ` / ${quota.limit}`}
            </div>
          )}
          {quota.note && <div style={{ color: "#888" }}>{quota.note}</div>}
          {quota.fetchedAt && (
            <div style={{ color: "#888", fontSize: 12 }}>
              {quota.fetchedAt > Date.now() - 60_000 ? t("updatedJustNow") : t("updatedAgo", Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 60_000)))}
            </div>
          )}
          {quota.resetAt && <div style={{ color: "#888" }}>{t("resetLabel")}: {new Date(quota.resetAt).toLocaleDateString()}</div>}
          {quota.breakdown && Object.keys(quota.breakdown).length > 0 && (
            <div style={{ color: "#888" }}>{t("usageLabel")}: {Object.entries(quota.breakdown).map(([k, v]) => `${k} ${v}`).join(" · ")}</div>
          )}
          <button onClick={onRefreshQuota} style={{ marginTop: 4, fontSize: 12, padding: "0 8px" }}>
            {t("refreshQuota")}
          </button>
        </div>
      )}

      {/* Self-hosted base URL */}
      {p.baseUrl !== undefined && p.name === "searxng" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <label>{t("baseUrlLabel")}</label>
          <input value={p.baseUrl} onChange={(e) => onBaseUrl(e.target.value)} style={{ flex: 1 }} />
        </div>
      )}

      {/* Key pool */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <label style={{ color: "#888" }}>
          {t("apiKeyLabel")}{p.poolSize > 1 ? t("apiKeyPool", p.poolSize) : ""}
        </label>
        <input
          type="password"
          value={keyDraft}
          onChange={(e) => onKeyDraft(e.target.value)}
          placeholder={p.keyConfigured ? t("apiKeyPlaceholderSet") : t("apiKeyPlaceholderUnset")}
          style={{ flex: 1 }}
        />
        <button onClick={onSaveKey} disabled={busy}>
          {busy ? "…" : t("saveBtn")}
        </button>
        <button onClick={onTest} disabled={busy}>
          {busy ? "…" : t("testBtn")}
        </button>
      </div>

      {/* Per-provider connection test result */}
      {testResult && (
        <div style={{ fontSize: 12 }}>
          {testResult.ok ? (
            <div style={{ color: "#2c6" }}>
              ✓ {t("testOk")} · {testResult.latencyMs}ms · {testResult.resultCount ?? 0} {t("resultCount", testResult.resultCount ?? 0)}
              {testResult.title && <span style={{ color: "#888" }}> · {testResult.title}</span>}
            </div>
          ) : (
            <div style={{ color: "#c33" }}>
              ✕ {t("testFail")}: {testResult.error?.message ?? ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuotaBar(props: { label: string; remaining: number; limit?: number }) {
  const { label, remaining, limit } = props;
  const pct = limit && limit > 0 ? Math.min(100, Math.max(0, (remaining / limit) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      <div style={{ flex: 1, maxWidth: 160, height: 8, background: "#333", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct < 10 ? "#c33" : "#2c6" }} />
      </div>
    </div>
  );
}

function TestResultView(props: { result: TestSearchView; providers: ProviderView[]; t: (key: string, ...args: unknown[]) => string }) {
  const { result, providers, t } = props;
  const label = (name: string) => providers.find((p) => p.name === name)?.label ?? name;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {result.ok ? (
        <>
          <div style={{ color: "#2c6" }}>
            ✓ {label(result.backend ?? "")} · {result.latencyMs}ms · {result.resultCount ?? 0} {t("resultCount", result.resultCount ?? 0)}
          </div>
          {(result.attempts ?? []).length > 1 && (
            <div style={{ color: "#888", fontSize: 12 }}>
              {t("attempts")}: {result.attempts!.map((a) => `${label(a.provider)}:${a.outcome}`).join(" → ")}
            </div>
          )}
          {(result.results ?? []).slice(0, 5).map((r, i) => (
            <div key={i} style={{ borderTop: "1px solid #333", paddingTop: 4 }}>
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.title}
              </a>
              <div style={{ color: "#888", fontSize: 12 }}>{r.snippet.slice(0, 180)}</div>
            </div>
          ))}
        </>
      ) : (
        <div style={{ color: "#c33" }}>
          ✕ {result.error?.message ?? "search failed"}
          {(result.attempts ?? []).length > 0 && (
            <div style={{ color: "#888", fontSize: 12 }}>
              {t("attempts")}: {result.attempts!.map((a) => `${label(a.provider)}:${a.outcome}`).join(" → ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
