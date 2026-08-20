/**
 * dsh-web-tools — P4 Search Preferences (ProviderPreferencesSection).
 *
 * Modern single-select preference UI replacing the old white <select> form.
 *
 * Rules enforced here:
 *  - primary provider mode  -> ChoiceCard (role=radio), never native <select>
 *  - boolean                -> Switch
 *  - small secondary choice -> segmented control (inline pill buttons)
 *  - rare numeric           -> "更多设置" reveal only
 *  - collapsed row is clickable, shows current summary + 推荐 / 已自定义 pill
 *  - action row (已修改 N 项 / 恢复推荐 / 保存) appears only while dirty
 *
 * Wire contract unchanged: draft holds raw provider-native overrides; save
 * posts them to provider-options/set, reset deletes the override.
 * @module
 */
import { useState, type ReactNode } from "react";
import { Button, IconChevronRightOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "../api.ts";
import { text, surface, state as stateColor } from "../theme.ts";
import { ChoiceCard } from "./ChoiceCard.tsx";
import { formatProviderOptionsSummary } from "../logic.ts";
import { Switch } from "../WebToolsSection.tsx";

type TFunc = (key: string, ...args: unknown[]) => string;

interface Props {
  t: TFunc;
  p: {
    name: string;
    label: string;
    options?: {
      overrides: Record<string, unknown>;
      effective: Record<string, unknown>;
      customized: boolean;
      isDefault: boolean;
    };
  };
  onConfigChanged: () => void;
}

/** Collapsed pill: 推荐 (brand) or 已自定义 (neutral). */
function Pill(props: { kind: "recommend" | "custom" | "none" }) {
  if (props.kind === "none") return null;
  const isRecommend = props.kind === "recommend";
  const color = isRecommend ? "var(--dsw-alias-brand-primary)" : text.tertiary;
  const bg = isRecommend ? "color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)" : surface.layer2;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        lineHeight: 1,
        padding: "3px 8px",
        borderRadius: 999,
        border: `1px solid ${color}55`,
        background: bg,
        color,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {isRecommend ? "推荐" : "已自定义"}
    </span>
  );
}

/** Small inline segmented control (fast/instant, deep-lite/…, freshness presets). */
function Segmented(props: {
  options: Array<{ value: string; label: string; title?: string }>;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { options, value, onChange, disabled } = props;
  return (
    <div
      role="radiogroup"
      style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 999,
              cursor: disabled ? "not-allowed" : "pointer",
              border: `1px solid ${selected ? "var(--dsw-alias-brand-primary)" : surface.border}`,
              background: selected ? "color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)" : surface.layer2,
              color: selected ? "var(--dsw-alias-label-primary)" : text.secondary,
              fontFamily: "inherit",
              outline: "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Standard number input (advanced settings only). */
function NumberField(props: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const { label, hint, value, placeholder, onChange } = props;
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: text.secondary }}>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "5px 9px",
          borderRadius: 7,
          border: `1px solid ${surface.border}`,
          background: surface.layer2,
          color: text.primary,
          fontFamily: "inherit",
          fontSize: 13,
          width: 120,
        }}
      />
      {hint && <span style={{ color: text.tertiary, fontSize: 11 }}>{hint}</span>}
    </label>
  );
}

export function ProviderPreferencesSection(props: Props) {
  const { p, onConfigChanged } = props;
  const isExcluded = p.name === "jina" || p.name === "searxng";
  if (isExcluded || !p.options) {
    // Jina/SearXNG expose no user-facing native options.
    return null;
  }

  return <PreferencesBody key={p.name} p={p} onConfigChanged={onConfigChanged} />;
}

/** Body keyed by provider: draft state is rebuilt per provider entry. */
function PreferencesBody(props: { p: Props["p"]; onConfigChanged: () => void }) {
  const { p, onConfigChanged } = props;
  const [expanded, setExpanded] = useState(false);
  const seed = { ...(p.options?.overrides ?? {}) };
  const [draft, setDraft] = useState<Record<string, unknown>>(seed);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const eff = p.options!.effective;
  const isDef = p.options!.isDefault;
  const savedOverrides = p.options!.overrides ?? {};

  /** Write one raw override; drop it when it equals the provider default. */
  const setValue = (key: string, value: unknown, defaultValue: unknown) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (value === defaultValue) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  // Dirty = draft differs from the persisted overrides (only user edits count).
  const dirtyKeys = Object.keys(draft).filter((k) => draft[k] !== savedOverrides[k]);
  const dirty = dirtyKeys.length > 0;

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.providerOptionsSet(p.name, draft);
      onConfigChanged();
      setMsg("已保存");
      window.setTimeout(() => setMsg(null), 2000);
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
      window.setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg("恢复失败");
    } finally {
      setSaving(false);
    }
  };

  const summary = formatProviderOptionsSummary(p.name, eff);
  const pillKind: "recommend" | "custom" | "none" = !isDef ? "custom" : expanded ? "recommend" : "recommend";

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${surface.border}`, paddingTop: 14 }}>
      {/* Collapsed / expanded header row — whole row clickable */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          borderRadius: 8,
          padding: "2px 4px",
          margin: "-2px -4px",
          outline: "none",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: text.primary }}>搜索偏好</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: text.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {summary}
            </span>
            <Pill kind={pillKind} />
          </div>
        </div>
        <span style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s ease", flex: "none", color: text.tertiary, display: "inline-flex" }}>
          <IconChevronRightOutline14 size={14} />
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
          <ProviderControls provider={p.name} draft={draft} setValue={setValue} eff={eff} />

          {/* Dirty action row — only when the user actually changed something */}
          {dirty && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2, paddingTop: 10, borderTop: `1px solid ${surface.border}` }}>
              <span style={{ fontSize: 12, color: text.secondary }}>
                已修改 {dirtyKeys.length} 项
              </span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Button size="sm" variant="ghost" onClick={handleReset} disabled={saving}>
                  恢复推荐
                </Button>
                <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? "保存中..." : "保存"}
                </Button>
              </span>
            </div>
          )}
          {msg && <div style={{ fontSize: 12, color: stateColor.success, textAlign: "right" }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

/** Per-provider control panels — human-language cards over native options. */
function ProviderControls(props: {
  provider: string;
  draft: Record<string, unknown>;
  setValue: (key: string, value: unknown, defaultValue: unknown) => void;
  eff: Record<string, unknown>;
}) {
  const { provider, draft, setValue, eff } = props;

  const raw = (key: string, fallback: unknown): unknown => draft[key] ?? fallback;

  switch (provider) {
    // ------------------------------------------------------------------ Exa
    case "exa": {
      const searchType = String(raw("searchType", "auto"));
      const group: "auto" | "speed" | "deep" =
        searchType === "fast" || searchType === "instant"
          ? "speed"
          : searchType.startsWith("deep")
            ? "deep"
            : "auto";
      const maxAgeHours = raw("maxAgeHours", undefined);
      const freshness: "auto" | "live" | "cache" =
        maxAgeHours === 0 ? "live" : maxAgeHours === -1 ? "cache" : "auto";

      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>搜索方式</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard
                selected={group === "auto"}
                title="自动平衡"
                description="大多数搜索的最佳选择"
                badge="推荐"
                onClick={() => setValue("searchType", "auto", "auto")}
              />
              <ChoiceCard
                selected={group === "speed"}
                title="快速响应"
                description="更低延迟，适合简单、明确问题"
                onClick={() => setValue("searchType", "fast", "auto")}
              />
              <ChoiceCard
                selected={group === "deep"}
                title="深度检索"
                description="复杂问题 · 较慢"
                onClick={() => setValue("searchType", "deep-lite", "auto")}
              />
            </div>
            {group === "speed" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: text.secondary }}>速度</span>
                <Segmented
                  options={[
                    { value: "fast", label: "快速" },
                    { value: "instant", label: "极速" },
                  ]}
                  value={String(raw("searchType", "fast"))}
                  onChange={(v) => setValue("searchType", v, "auto")}
                />
              </div>
            )}
            {group === "deep" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: text.secondary }}>深度</span>
                <Segmented
                  options={[
                    { value: "deep-lite", label: "轻量" },
                    { value: "deep", label: "深入" },
                    { value: "deep-reasoning", label: "推理" },
                  ]}
                  value={String(raw("searchType", "deep-lite"))}
                  onChange={(v) => setValue("searchType", v, "auto")}
                />
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>内容新鲜度</SectionLabel>
            <Segmented
              options={[
                { value: "auto", label: "自动", title: "由 Exa 平衡缓存和实时抓取" },
                { value: "live", label: "始终刷新", title: "内容更新，但速度更慢" },
                { value: "cache", label: "仅缓存", title: "速度最快，可能不是最新" },
              ]}
              value={freshness}
              onChange={(v) => {
                if (v === "auto") setValue("maxAgeHours", undefined, undefined);
                else if (v === "live") setValue("maxAgeHours", 0, undefined);
                else setValue("maxAgeHours", -1, undefined);
              }}
            />
            <AdvancedDelay>
              <NumberField
                label="自定义缓存最大年龄（小时，留空用自动）"
                hint="例如 24 = 优先使用 24 小时内的缓存"
                value={typeof draft.maxAgeHours === "number" ? String(draft.maxAgeHours) : ""}
                onChange={(v) => {
                  const n = Number(v);
                  if (v === "" || Number.isNaN(n)) setValue("maxAgeHours", undefined, undefined);
                  else setValue("maxAgeHours", Math.round(n), undefined);
                }}
              />
            </AdvancedDelay>
          </div>
        </>
      );
    }

    // --------------------------------------------------------------- Tavily
    case "tavily": {
      const autoParams = raw("autoParameters", false) === true;
      // When autoParameters is on, the explicit mode cards are disabled.
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>搜索深度</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard
                selected={!autoParams && raw("searchDepth", "basic") === "basic"}
                title="平衡"
                description="日常搜索"
                badge="推荐"
                meta="1 credit"
                disabled={autoParams}
                onClick={() => setValue("searchDepth", "basic", "basic")}
              />
              <ChoiceCard
                selected={!autoParams && raw("searchDepth", "basic") === "advanced"}
                title="高质量"
                description="更高相关性"
                meta="2 credits"
                disabled={autoParams}
                onClick={() => setValue("searchDepth", "advanced", "basic")}
              />
              <ChoiceCard
                selected={!autoParams && raw("searchDepth", "basic") === "fast"}
                title="快速"
                description="更低延迟"
                meta="1 credit"
                disabled={autoParams}
                onClick={() => setValue("searchDepth", "fast", "basic")}
              />
              <ChoiceCard
                selected={!autoParams && raw("searchDepth", "basic") === "ultra-fast"}
                title="极速"
                description="最低延迟"
                meta="1 credit"
                disabled={autoParams}
                onClick={() => setValue("searchDepth", "ultra-fast", "basic")}
              />
            </div>
          </div>

          <AdvancedDelay>
            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Switch
                checked={autoParams}
                onChange={(v) => setValue("autoParameters", v, false)}
                label="智能调参"
              />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, color: text.primary }}>智能调参</span>
                <span style={{ fontSize: 12, color: text.secondary }}>
                  {autoParams ? "开启·成本可能变化（部分查询可能用高质量 2 credits）" : "允许 Tavily 根据问题自动优化搜索参数"}
                </span>
              </span>
            </label>
          </AdvancedDelay>
        </>
      );
    }

    // ---------------------------------------------------------------- Brave
    case "brave": {
      const pref = String(raw("endpointPreference", "auto"));
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>检索模式</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard
                selected={pref === "auto"}
                title="智能上下文"
                description="为 AI 返回高相关片段"
                badge="推荐"
                onClick={() => setValue("endpointPreference", "auto", "auto")}
              />
              <ChoiceCard
                selected={pref === "web-search"}
                title="传统网页搜索"
                description="标准 Brave Search 结果"
                onClick={() => setValue("endpointPreference", "web-search", "auto")}
              />
            </div>
          </div>
          <AdvancedDelay>
            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Switch
                checked={pref === "llm-context"}
                onChange={(v) => setValue("endpointPreference", v ? "llm-context" : "auto", "auto")}
                label="仅智能上下文"
              />
              <span style={{ fontSize: 12, color: text.secondary }}>不自动回退到传统搜索（高级）</span>
            </label>
            <Segmented
              options={[
                { value: "balanced", label: "自动" },
                { value: "strict", label: "标准" },
                { value: "lenient", label: "较多" },
              ]}
              value={String(raw("contextThresholdMode", "balanced"))}
              onChange={(v) => setValue("contextThresholdMode", v, "balanced")}
            />
          </AdvancedDelay>
        </>
      );
    }

    // ---------------------------------------------------------------- You.com
    case "you": {
      const ext = String(raw("extractionMode", "highlights"));
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>搜索结果</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard
                selected={ext === "highlights"}
                title="AI 相关片段"
                description="更适合 AI 回答问题"
                badge="推荐"
                onClick={() => setValue("extractionMode", "highlights", "highlights")}
              />
              <ChoiceCard
                selected={ext === "none"}
                title="简短摘要"
                description="更轻量，返回传统搜索摘要"
                onClick={() => setValue("extractionMode", "none", "highlights")}
              />
            </div>
          </div>
          <AdvancedDelay>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <NumberField
                label="页面读取超时（秒）"
                value={typeof draft.fetchCrawlTimeoutSec === "number" ? String(draft.fetchCrawlTimeoutSec) : ""}
                onChange={(v) => {
                  const n = Number(v);
                  if (v === "" || Number.isNaN(n)) setValue("fetchCrawlTimeoutSec", undefined, undefined);
                  else setValue("fetchCrawlTimeoutSec", Math.round(n), undefined);
                }}
              />
              <NumberField
                label="缓存新鲜度（秒，0 = 始终刷新）"
                value={typeof draft.fetchMaxAgeSec === "number" ? String(draft.fetchMaxAgeSec) : ""}
                onChange={(v) => {
                  const n = Number(v);
                  if (v === "" || Number.isNaN(n)) setValue("fetchMaxAgeSec", undefined, undefined);
                  else setValue("fetchMaxAgeSec", Math.round(n), undefined);
                }}
              />
            </div>
          </AdvancedDelay>
        </>
      );
    }

    // ------------------------------------------------------------ Firecrawl
    case "firecrawl": {
      const onlyMain = raw("fetchOnlyMainContent", true) !== false;
      const maxAge = raw("fetchMaxAgeMs", undefined);
      const cacheKind: "auto" | "live" | "day" | "week" =
        maxAge === 0 ? "live" : maxAge === 86400000 ? "day" : maxAge === 604800000 ? "week" : "auto";
      return (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Switch
              checked={onlyMain}
              onChange={(v) => setValue("fetchOnlyMainContent", v, true)}
              label="只保留正文"
            />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, color: text.primary }}>只保留正文</span>
              <span style={{ fontSize: 12, color: text.secondary }}>去掉导航、页脚等外围内容</span>
            </span>
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>页面缓存</SectionLabel>
            <Segmented
              options={[
                { value: "auto", label: "智能缓存", title: "由 Firecrawl 平衡缓存与实时抓取" },
                { value: "live", label: "始终刷新" },
                { value: "day", label: "缓存 1 天" },
                { value: "week", label: "缓存 7 天" },
              ]}
              value={cacheKind}
              onChange={(v) => {
                if (v === "auto") setValue("fetchMaxAgeMs", undefined, undefined);
                else if (v === "live") setValue("fetchMaxAgeMs", 0, undefined);
                else if (v === "day") setValue("fetchMaxAgeMs", 86400000, undefined);
                else setValue("fetchMaxAgeMs", 604800000, undefined);
              }}
            />
          </div>
        </>
      );
    }

    // -------------------------------------------------------------- Parallel
    case "parallel": {
      const mode = String(raw("mode", "advanced"));
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>搜索质量</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard
                selected={mode === "advanced"}
                title="高质量"
                description="更适合复杂搜索"
                badge="推荐"
                onClick={() => setValue("mode", "advanced", "advanced")}
              />
              <ChoiceCard
                selected={mode === "basic"}
                title="平衡"
                description="低延迟，适合明确问题"
                onClick={() => setValue("mode", "basic", "advanced")}
              />
              <ChoiceCard
                selected={mode === "fast"}
                title="快速"
                description="1 秒延迟预算内的高质量"
                onClick={() => setValue("mode", "fast", "advanced")}
              />
              <ChoiceCard
                selected={mode === "turbo"}
                title="极速"
                description="约 200ms 高吞吐"
                onClick={() => setValue("mode", "turbo", "advanced")}
              />
            </div>
          </div>
          <AdvancedDelay>
            <Segmented
              options={[
                { value: "auto", label: "自动" },
                { value: "10000", label: "精简" },
                { value: "25000", label: "标准" },
                { value: "50000", label: "较多" },
              ]}
              value={
                typeof draft.maxCharsTotal === "number"
                  ? String(draft.maxCharsTotal)
                  : "auto"
              }
              onChange={(v) => {
                if (v === "auto") setValue("maxCharsTotal", undefined, undefined);
                else setValue("maxCharsTotal", Number(v), undefined);
              }}
            />
          </AdvancedDelay>
        </>
      );
    }

    default:
      return null;
  }
}

function SectionLabel(props: { children: ReactNode }) {
  return <span style={{ fontSize: 12, fontWeight: 600, color: text.secondary }}>{props.children}</span>;
}

/** "更多设置" collapsible — advanced numeric / niche knobs stay hidden. */
function AdvancedDelay(props: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 0",
          fontSize: 12,
          border: "none",
          background: "transparent",
          color: text.secondary,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", display: "inline-flex" }}>
          <IconChevronRightOutline14 size={12} />
        </span>
        更多设置
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 8, borderRadius: 8, background: surface.layer1 }}>{props.children}</div>}
    </div>
  );
}