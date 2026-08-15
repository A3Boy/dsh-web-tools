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

  const load = async () => {
    const token = ++loadToken.current;
    try {
      const [cfg, quota] = await Promise.all([api.configGet(), api.quotaDescribe()]);
      if (token !== loadToken.current) return;
      setConfig(cfg);
      setQuotas(quota.quotas);
      setError("");
    } catch (e) {
      if (token === loadToken.current) setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000); // refresh quotas periodically
    return () => {
      loadToken.current += 1;
      clearInterval(timer);
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

  const setDefaultProvider = (name: string) => void save({ defaultProvider: name });
  const setEnabled = (enabled: boolean) => void save({ enabled });
  const setMaxResults = (v: number) => void save({ maxResults: Math.min(10, Math.max(1, v)) });
  const setTimeoutMs = (v: number) => void save({ searchTimeoutMs: Math.min(60000, Math.max(1000, v)) });
  const setFallbackOrder = (order: string[]) => void save({ fallbackOrder: order });
  const toggleProvider = (name: string, enabled: boolean) => {
    const providerEnabled = Object.fromEntries(config.providers.map((p) => [p.name, p.name === name ? enabled : p.enabled]));
    void save({ providerEnabled });
  };
  const setBaseUrl = (name: string, baseUrl: string) => {
    const providerBaseUrls = { ...(config.providers.reduce((a, p) => ({ ...a, [p.name]: p.baseUrl ?? "" }), {})) };
    providerBaseUrls[name] = baseUrl;
    void save({ providerBaseUrls });
  };

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

  const orderButtons = config.providers.filter((p) => p.name !== config.defaultProvider);

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
          <label>默认搜索引擎</label>
          <select value={config.defaultProvider} onChange={(e) => setDefaultProvider(e.target.value)}>
            {config.providers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label>搜索结果数量</label>
          <input
            type="number"
            min={1}
            max={10}
            value={config.maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            style={{ width: 60 }}
          />
          <label style={{ marginLeft: 12 }}>超时 (ms)</label>
          <input
            type="number"
            min={1000}
            max={60000}
            value={config.searchTimeoutMs}
            onChange={(e) => setTimeoutMs(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label>Fallback 顺序</label>
          <select
            value={config.fallbackOrder[0] ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return setFallbackOrder([]);
              const rest = config.fallbackOrder.filter((x) => x !== v);
              setFallbackOrder([v, ...rest]);
            }}
          >
            <option value="">(none)</option>
            {orderButtons.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>
          <span style={{ color: "#888" }}>
            {config.fallbackOrder.length > 0
              ? config.fallbackOrder.map((n) => config.providers.find((p) => p.name === n)?.label ?? n).join(" → ")
              : "无备选，失败即报错"}
          </span>
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
      {p.pool.length > 1 && (
        <div style={{ color: "#888", fontSize: 12 }}>
          {p.pool.map((e) => `${e.hint}${e.healthy ? "" : " (unhealthy)"}×${e.uses}`).join(" · ")}
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
