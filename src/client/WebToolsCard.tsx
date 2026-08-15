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
import { api, type ConfigView, type QuotaView, type TestSearchView, type ProviderView } from "./api.ts";

interface CardProps {
  /** locale copy injected by the card slot (minimal set). */
  locale?: Record<string, string>;
}

export function WebToolsCard(_props: CardProps) {
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [quotas, setQuotas] = useState<Record<string, QuotaView> | null>(null);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<TestSearchView | null>(null);
  const [testQuery, setTestQuery] = useState("DeepSeek Harness");
  const [testing, setTesting] = useState(false);
  const [busyProviders, setBusyProviders] = useState<Record<string, boolean>>({});
  const loadToken = useRef(0);
  const mounted = useRef(true);

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
        {error ? `Web Tools: ${error}` : "Loading Web Tools configuration…"}
      </div>
    );
  }

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api.configSave(patch);
      await load();
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
      // show a transient inline note; reuse the main test area for detail
      setTestResult({
        ok: r.ok,
        backend: provider,
        latencyMs: r.latencyMs,
        resultCount: r.resultCount,
        error: r.error,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        <strong>Web Search</strong>
        <button
          onClick={() => setEnabled(!config.enabled)}
          style={{ marginLeft: "auto", padding: "2px 10px" }}
        >
          {config.enabled ? "Enabled" : "Disabled"}
        </button>
        {saving && <span style={{ color: "#888" }}>saving…</span>}
      </div>
      {error && <div style={{ color: "#c33" }}>{error}</div>}

      {/* General */}
      <div style={{ border: "1px solid #444", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label>单 Provider 超时 (ms)</label>
          <input
            type="number"
            min={1000}
            max={60000}
            value={config.providerAttemptTimeoutMs}
            onChange={(e) => setAttemptTimeout(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <span style={{ color: "#888", fontSize: 12 }}>单个搜索源最多等待多久，超时后切换下一家（总超时由 DSH 工具层控制）</span>
        </div>

        {/* Search priority: one ordered list, first entry = default */}
        <div style={{ borderTop: "1px solid #333", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <strong>搜索优先级</strong>
            <span style={{ color: "#888", fontSize: 12 }}>第一项为默认 Provider，其余按顺序用于故障切换</span>
          </div>
          {orderedProviders.map((name, i) => {
            const p = providerOf(name);
            const disabled = !p || !enabledNames.has(name);
            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, opacity: disabled ? 0.55 : 1 }}>
                <span style={{ color: "#888", width: 18 }}>{i + 1}.</span>
                <span style={{ fontWeight: i === 0 ? 700 : 400 }}>
                  {p?.label ?? name}
                  {i === 0 && <span style={{ color: "#2c6", fontSize: 11, marginLeft: 6 }}>默认</span>}
                  {disabled && <span style={{ color: "#c33", fontSize: 11, marginLeft: 6 }}>Disabled</span>}
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button onClick={() => moveOrder(i, -1)} disabled={i === 0} title="上移">↑</button>
                  <button onClick={() => moveOrder(i, 1)} disabled={i === orderedProviders.length - 1} title="下移">↓</button>
                  {i !== 0 && <button onClick={() => removeFromOrder(name)} title="移出优先级（不禁用 Provider）">×</button>}
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
                + 添加 Provider
              </button>
              {availableToAdd.length > 1 && (
                <span style={{ color: "#888", fontSize: 12 }}>
                  可添加：{availableToAdd.map((n) => providerOf(n)?.label ?? n).join(" · ")}
                </span>
              )}
            </div>
          )}
          <div style={{ color: "#888", fontSize: 12, borderTop: "1px solid #333", paddingTop: 6 }}>
            Effective order：
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
            busy={!!busyProviders[p.name]}
            keyDraft={keyDrafts[p.name] ?? ""}
            onKeyDraft={(v) => setKeyDrafts((d) => ({ ...d, [p.name]: v }))}
            onSaveKey={() => void saveKey(p.name)}
            onTest={() => void testProvider(p.name)}
            onToggle={(enabled) => toggleProvider(p.name, enabled)}
            onBaseUrl={(url) => setBaseUrl(p.name, url)}
            isDefault={p.name === config.defaultProvider}
          />
        ))}
      </div>

      {/* Test search */}
      <div style={{ border: "1px solid #444", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>测试搜索</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            style={{ flex: 1 }}
            placeholder="输入查询…"
          />
          <button onClick={() => void runTestSearch()} disabled={testing}>
            {testing ? "Searching…" : "Search"}
          </button>
        </div>
        {testResult && <TestResultView result={testResult} providers={config.providers} />}
      </div>
    </div>
  );
}

function ProviderRow(props: {
  key?: string;
  provider: ProviderView;
  quota?: QuotaView;
  busy: boolean;
  keyDraft: string;
  onKeyDraft: (v: string) => void;
  onSaveKey: () => void;
  onTest: () => void;
  onToggle: (enabled: boolean) => void;
  onBaseUrl: (url: string) => void;
  isDefault: boolean;
}) {
  const { provider: p, quota, busy, keyDraft, onKeyDraft, onSaveKey, onTest, onToggle, onBaseUrl, isDefault } = props;
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

      {/* Quota */}
      {quota && (
        <div style={{ color: "#bbb" }}>
          {quota.supported && quota.authoritative && quota.unit === "credits" && quota.remaining !== undefined && (
            <QuotaBar label={`${quota.remaining} / ${quota.limit ?? "?"} credits`} remaining={quota.remaining} limit={quota.limit} />
          )}
          {quota.supported && quota.authoritative && quota.unit !== "credits" && quota.remaining !== undefined && (
            <div>
              {quota.remaining} {quota.unit}
              {quota.limit !== undefined && ` / ${quota.limit}`}
            </div>
          )}
          {quota.note && <div style={{ color: "#888" }}>{quota.note}</div>}
          {quota.resetAt && <div style={{ color: "#888" }}>重置: {new Date(quota.resetAt).toLocaleDateString()}</div>}
          {quota.breakdown && Object.keys(quota.breakdown).length > 0 && (
            <div style={{ color: "#888" }}>消耗: {Object.entries(quota.breakdown).map(([k, v]) => `${k} ${v}`).join(" · ")}</div>
          )}
        </div>
      )}

      {/* Self-hosted base URL */}
      {p.baseUrl !== undefined && p.name === "searxng" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <label>Base URL</label>
          <input value={p.baseUrl} onChange={(e) => onBaseUrl(e.target.value)} style={{ flex: 1 }} />
        </div>
      )}

      {/* Key pool */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <label style={{ color: "#888" }}>
          API Key{p.poolSize > 1 ? `s (池 x${p.poolSize})` : ""}
        </label>
        <input
          type="password"
          value={keyDraft}
          onChange={(e) => onKeyDraft(e.target.value)}
          placeholder={p.keyConfigured ? "已配置 (多个 key 用逗号分隔)" : "未配置 (多个 key 用逗号分隔)"}
          style={{ flex: 1 }}
        />
        <button onClick={onSaveKey} disabled={busy}>
          {busy ? "…" : "Save"}
        </button>
        <button onClick={onTest} disabled={busy}>
          {busy ? "…" : "Test"}
        </button>
      </div>
      {p.poolSize > 1 && (
        <div style={{ color: "#888", fontSize: 12 }}>
          {p.poolSize} 个 Key（凭据池，按最少使用优先轮换）
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

function TestResultView(props: { result: TestSearchView; providers: ProviderView[] }) {
  const { result, providers } = props;
  const label = (name: string) => providers.find((p) => p.name === name)?.label ?? name;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {result.ok ? (
        <>
          <div style={{ color: "#2c6" }}>
            ✓ {label(result.backend ?? "")} · {result.latencyMs}ms · {result.resultCount ?? 0} 结果
          </div>
          {(result.attempts ?? []).length > 1 && (
            <div style={{ color: "#888", fontSize: 12 }}>
              尝试: {result.attempts!.map((a) => `${label(a.provider)}:${a.outcome}`).join(" → ")}
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
              尝试: {result.attempts!.map((a) => `${label(a.provider)}:${a.outcome}`).join(" → ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
