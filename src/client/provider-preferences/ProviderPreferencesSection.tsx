/**
 * dsh-web-tools — P4 Search Preferences (ProviderPreferencesSection).
 *
 * Modern single-select preference UI replacing the old white <select> form.
 *
 * Wire contract unchanged: draft holds raw provider-native overrides; save
 * posts them to provider-options/set, reset deletes the override.
 * @module
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  onConfigChanged: () => Promise<void> | void;
}

/** Collapsed pill: 已调整 (neutral) / 未保存 (warning). Default state returns null (§30). */
function Pill(props: { t: TFunc; kind: "default" | "adjusted" | "unsaved" | "none" }) {
  if (props.kind === "none" || props.kind === "default") return null;
  const isUnsaved = props.kind === "unsaved";
  const color = isUnsaved ? stateColor.warning : text.tertiary;
  const bg = surface.layer2;
  const label = isUnsaved ? props.t("prefsUnsaved") : props.t("prefsAdjusted");
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
      {label}
    </span>
  );
}

function Segmented(props: {
  options: Array<{ value: string; label: string; title?: string }>;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { options, value, onChange, disabled } = props;
  return (
    <div role="radiogroup" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
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
  const { t, p, onConfigChanged } = props;
  if (p.name === "searxng" || !p.options) return null;
  return <PreferencesBody key={p.name} t={t} p={p} onConfigChanged={onConfigChanged} />;
}

function PreferencesBody(props: { t: TFunc; p: Props["p"]; onConfigChanged: () => Promise<void> | void }) {
  const { t, p, onConfigChanged } = props;
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...(p.options?.overrides ?? {}) }));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  // Sync draft whenever upstream options change from external reload or save
  useEffect(() => {
    setDraft({ ...(p.options?.overrides ?? {}) });
  }, [p.options?.overrides]);

  const eff = p.options!.effective;
  const isDef = p.options!.isDefault;
  const savedOverrides = useMemo(() => p.options?.overrides ?? {}, [p.options?.overrides]);

  const setValue = (key: string, value: unknown, defaultValue: unknown) => {
    setMsg(null);
    setDraft((prev) => {
      const next = { ...prev };
      if (value === defaultValue) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const allKeys = new Set([...Object.keys(draft), ...Object.keys(savedOverrides)]);
  const dirtyKeys = [...allKeys].filter((key) => !Object.is(draft[key], savedOverrides[key]));
  const dirty = dirtyKeys.length > 0;

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await api.providerOptionsSet(p.name, draft);
      if (res?.options?.overrides) {
        setDraft({ ...res.options.overrides });
      }
      await onConfigChanged();
      setMsg({ text: t("prefsSaved"), tone: "success" });
      window.setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg({ text: t("prefsSaveFailed"), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setDraft({ ...savedOverrides }); setMsg(null); };
  const handleResetToDefaults = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await api.providerOptionsReset(p.name);
      setDraft({});
      await onConfigChanged();
      setMsg({ text: t("prefsRestored"), tone: "success" });
      window.setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg({ text: t("prefsRestoreFailed"), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const summary = formatProviderOptionsSummary(p.name, eff, (key) => t(key));
  const pillKind: "default" | "adjusted" | "unsaved" | "none" = dirty ? "unsaved" : !isDef ? "adjusted" : "default";

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${surface.border}`, paddingTop: 14 }}>
      <div role="button" tabIndex={0} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderRadius: 8, padding: "2px 4px", margin: "-2px -4px", outline: "none" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: text.primary }}>{t("prefsTitle")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: text.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
            <Pill t={t} kind={pillKind} />
          </div>
        </div>
        <span style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s ease", flex: "none", color: text.tertiary, display: "inline-flex" }}>
          <IconChevronRightOutline14 size={14} />
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
          <ProviderControls t={t} provider={p.name} draft={draft} setValue={setValue} eff={eff} />

          {dirty && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2, paddingTop: 10, borderTop: `1px solid ${surface.border}` }}>
              <span style={{ fontSize: 12, color: text.secondary }}>{t("prefsModified", { n: dirtyKeys.length })}</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>{t("prefsCancel")}</Button>
                <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>{saving ? t("prefsSaving") : t("prefsSave")}</Button>
              </span>
            </div>
          )}

          {!dirty && !isDef && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2, paddingTop: 10, borderTop: `1px solid ${surface.border}` }}>
              <Button size="sm" variant="ghost" onClick={handleResetToDefaults} disabled={saving}>{t("prefsRestore")}</Button>
            </div>
          )}

          {msg && <div style={{ fontSize: 12, color: msg.tone === "error" ? stateColor.danger : stateColor.success, textAlign: "right" }}>{msg.text}</div>}
        </div>
      )}
    </div>
  );
}

/** Per-provider control panels — fully i18n, no hardcoded Chinese. */
function ProviderControls(props: {
  t: TFunc;
  provider: string;
  draft: Record<string, unknown>;
  setValue: (key: string, value: unknown, defaultValue: unknown) => void;
  eff: Record<string, unknown>;
}) {
  const { t, provider, draft, setValue, eff } = props;
  const raw = (key: string, fallback: unknown): unknown => draft[key] ?? fallback;

  switch (provider) {
    // ------------------------------------------------------------------ Exa
    case "exa": {
      const searchType = String(raw("searchType", "auto"));
      const group: "auto" | "speed" | "deep" = searchType === "fast" || searchType === "instant" ? "speed" : searchType.startsWith("deep") ? "deep" : "auto";
      const maxAgeHours = raw("maxAgeHours", undefined);
      const freshness: "auto" | "live" | "cache" = maxAgeHours === 0 ? "live" : maxAgeHours === -1 ? "cache" : "auto";
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsExaModeLabel")}</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard selected={group === "auto"} title={t("prefsExaAuto")} description={t("prefsExaAutoDesc")} badge={{ label: t("defaultBadge"), tone: "brand" }} onClick={() => setValue("searchType", "auto", "auto")} />
              <ChoiceCard selected={group === "speed"} title={t("prefsExaFast")} description={t("prefsExaFastDesc")} onClick={() => setValue("searchType", "fast", "auto")} />
              <ChoiceCard selected={group === "deep"} title={t("prefsExaDeep")} description={t("prefsExaDeepDesc")} onClick={() => setValue("searchType", "deep-lite", "auto")} />
            </div>
            {group === "speed" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: text.secondary }}>{t("prefsSpeed")}</span>
                <Segmented options={[{ value: "fast", label: t("prefsFast") }, { value: "instant", label: t("prefsInstant") }]} value={String(raw("searchType", "fast"))} onChange={(v) => setValue("searchType", v, "auto")} />
              </div>
            )}
            {group === "deep" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: text.secondary }}>{t("prefsDepth")}</span>
                <Segmented options={[{ value: "deep-lite", label: t("prefsDeepLite") }, { value: "deep", label: t("prefsDeep") }, { value: "deep-reasoning", label: t("prefsDeepReasoning") }]} value={String(raw("searchType", "deep-lite"))} onChange={(v) => setValue("searchType", v, "auto")} />
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsExaFreshnessLabel")}</SectionLabel>
            <Segmented options={[{ value: "auto", label: t("prefsFreshnessAuto") }, { value: "live", label: t("prefsFreshnessLive") }, { value: "cache", label: t("prefsFreshnessCache") }]} value={freshness}
              onChange={(v) => { if (v === "auto") setValue("maxAgeHours", undefined, undefined); else if (v === "live") setValue("maxAgeHours", 0, undefined); else setValue("maxAgeHours", -1, undefined); }} />
            <AdvancedDelay t={t}>
              <NumberField label={t("prefsExaFreshnessLabel") + " (h)"} hint={t("prefsExaMaxAgeHint")} value={typeof draft.maxAgeHours === "number" ? String(draft.maxAgeHours) : ""}
                onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("maxAgeHours", undefined, undefined); else setValue("maxAgeHours", Math.round(n), undefined); }} />
            </AdvancedDelay>
          </div>
        </>
      );
    }

    // --------------------------------------------------------------- Tavily
    case "tavily": {
      const autoParams = raw("autoParameters", false) === true;
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsTavilyDepthLabel")}</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard selected={!autoParams && raw("searchDepth", "basic") === "basic"} title={t("prefsTavilyBasic")} description={t("prefsTavilyBasicDesc")} badge={{ label: t("defaultBadge"), tone: "brand" }} meta="1 credit" disabled={autoParams} onClick={() => setValue("searchDepth", "basic", "basic")} />
              <ChoiceCard selected={!autoParams && raw("searchDepth", "basic") === "advanced"} title={t("prefsTavilyAdvanced")} description={t("prefsTavilyAdvancedDesc")} meta="2 credits" disabled={autoParams} onClick={() => setValue("searchDepth", "advanced", "basic")} />
              <ChoiceCard selected={!autoParams && raw("searchDepth", "basic") === "fast"} title={t("prefsTavilyFast")} description={t("prefsTavilyFastDesc")} meta="1 credit" disabled={autoParams} onClick={() => setValue("searchDepth", "fast", "basic")} />
              <ChoiceCard selected={!autoParams && raw("searchDepth", "basic") === "ultra-fast"} title={t("prefsTavilyUltraFast")} description={t("prefsTavilyUltraFastDesc")} meta="1 credit" disabled={autoParams} onClick={() => setValue("searchDepth", "ultra-fast", "basic")} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Switch checked={autoParams} onChange={(v) => setValue("autoParameters", v, false)} label={t("prefsTavilyAutoParams")} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, color: text.primary }}>{t("prefsTavilyAutoParams")}</span>
              <span style={{ fontSize: 12, color: text.secondary }}>{t("prefsTavilyAutoParamsDesc")}</span>
            </span>
          </label>
          <AdvancedDelay t={t}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsTavilyChunksPerSource")}</SectionLabel>
              <Segmented options={[{ value: "auto", label: t("prefsAutoLabel") }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]}
                value={typeof draft.chunksPerSource === "number" ? String(draft.chunksPerSource) : "auto"}
                onChange={(v) => { if (v === "auto") setValue("chunksPerSource", undefined, undefined); else setValue("chunksPerSource", Number(v), undefined); }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsTavilyExtractDepth")}</SectionLabel>
              <Segmented options={[{ value: "basic", label: t("prefsExtractBasic") }, { value: "advanced", label: t("prefsExtractAdvanced") }]}
                value={String(raw("fetchExtractDepth", "basic"))} onChange={(v) => setValue("fetchExtractDepth", v, "basic")} />
            </div>
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
            <SectionLabel>{t("prefsBraveModeLabel")}</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard selected={pref === "auto"} title={t("prefsBraveAuto")} description={t("prefsBraveAutoDesc")} badge={{ label: t("defaultBadge"), tone: "brand" }} onClick={() => setValue("endpointPreference", "auto", "auto")} />
              <ChoiceCard selected={pref === "llm-context"} title={t("prefsBraveLlmContext")} description={t("prefsBraveLlmContextDesc")} onClick={() => setValue("endpointPreference", "llm-context", "auto")} />
              <ChoiceCard selected={pref === "web-search"} title={t("prefsBraveWebSearch")} description={t("prefsBraveWebSearchDesc")} onClick={() => setValue("endpointPreference", "web-search", "auto")} />
            </div>
          </div>
          <AdvancedDelay t={t}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsBraveThreshold")}</SectionLabel>
              <Segmented options={[{ value: "balanced", label: t("prefsBraveThresholdBalanced") }, { value: "strict", label: t("prefsBraveThresholdStrict") }, { value: "lenient", label: t("prefsBraveThresholdLenient") }, { value: "off", label: t("prefsBraveThresholdOff") }]}
                value={String(raw("contextThresholdMode", "balanced"))} onChange={(v) => setValue("contextThresholdMode", v, "balanced")} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsBraveTokenBudget")}</SectionLabel>
              <Segmented options={[{ value: "auto", label: t("prefsAutoLabel") }, { value: "4000", label: "4K" }, { value: "8000", label: "8K" }, { value: "16000", label: "16K" }]}
                value={typeof draft.contextTokenBudget === "number" ? String(draft.contextTokenBudget) : "auto"}
                onChange={(v) => { if (v === "auto") setValue("contextTokenBudget", undefined, undefined); else setValue("contextTokenBudget", Number(v), undefined); }} />
            </div>
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
            <SectionLabel>{t("prefsYouResultsLabel")}</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard selected={ext === "highlights"} title={t("prefsYouHighlights")} description={t("prefsYouHighlightsDesc")} badge={{ label: t("defaultBadge"), tone: "brand" }} onClick={() => setValue("extractionMode", "highlights", "highlights")} />
              <ChoiceCard selected={ext === "none"} title={t("prefsYouSummary")} description={t("prefsYouSummaryDesc")} onClick={() => setValue("extractionMode", "none", "highlights")} />
            </div>
          </div>
          <AdvancedDelay t={t}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <NumberField label={t("prefsYouTimeoutSec")} value={typeof draft.fetchCrawlTimeoutSec === "number" ? String(draft.fetchCrawlTimeoutSec) : ""}
                onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchCrawlTimeoutSec", undefined, undefined); else setValue("fetchCrawlTimeoutSec", Math.round(n), undefined); }} />
              <NumberField label={t("prefsYouFreshnessSec")} value={typeof draft.fetchMaxAgeSec === "number" ? String(draft.fetchMaxAgeSec) : ""}
                onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchMaxAgeSec", undefined, undefined); else setValue("fetchMaxAgeSec", Math.round(n), undefined); }} />
            </div>
          </AdvancedDelay>
        </>
      );
    }

    // ------------------------------------------------------------ Firecrawl
    case "firecrawl": {
      const onlyMain = raw("fetchOnlyMainContent", true) !== false;
      const maxAge = raw("fetchMaxAgeMs", undefined);
      const cacheKind: "auto" | "live" | "day" | "week" = maxAge === 0 ? "live" : maxAge === 86400000 ? "day" : maxAge === 604800000 ? "week" : "auto";
      return (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Switch checked={onlyMain} onChange={(v) => setValue("fetchOnlyMainContent", v, true)} label={t("prefsFirecrawlOnlyMain")} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, color: text.primary }}>{t("prefsFirecrawlOnlyMain")}</span>
              <span style={{ fontSize: 12, color: text.secondary }}>{t("prefsFirecrawlOnlyMainDesc")}</span>
            </span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsPageCache")}</SectionLabel>
            <Segmented options={[{ value: "auto", label: t("prefsFreshnessAuto") }, { value: "live", label: t("prefsFreshnessLive") }, { value: "day", label: t("prefsFirecrawl1Day") }, { value: "week", label: t("prefsFirecrawl7Days") }]}
              value={cacheKind} onChange={(v) => { if (v === "auto") setValue("fetchMaxAgeMs", undefined, undefined); else if (v === "live") setValue("fetchMaxAgeMs", 0, undefined); else if (v === "day") setValue("fetchMaxAgeMs", 86400000, undefined); else setValue("fetchMaxAgeMs", 604800000, undefined); }} />
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
            <SectionLabel>{t("prefsParallelQualityLabel")}</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard selected={mode === "advanced"} title={t("prefsParallelAdvanced")} description={t("prefsParallelAdvancedDesc")} badge={{ label: t("defaultBadge"), tone: "brand" }} onClick={() => setValue("mode", "advanced", "advanced")} />
              <ChoiceCard selected={mode === "basic"} title={t("prefsParallelBasic")} description={t("prefsParallelBasicDesc")} onClick={() => setValue("mode", "basic", "advanced")} />
              <ChoiceCard selected={mode === "fast"} title={t("prefsParallelFast")} description={t("prefsParallelFastDesc")} onClick={() => setValue("mode", "fast", "advanced")} />
              <ChoiceCard selected={mode === "turbo"} title={t("prefsParallelTurbo")} description={t("prefsParallelTurboDesc")} onClick={() => setValue("mode", "turbo", "advanced")} />
            </div>
          </div>
          <AdvancedDelay t={t}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsParallelCharsLabel")}</SectionLabel>
              <Segmented options={[{ value: "auto", label: t("prefsAutoLabel") }, { value: "10000", label: t("prefsParallelCharsCompact") }, { value: "25000", label: t("prefsParallelCharsStandard") }, { value: "50000", label: t("prefsParallelCharsMore") }]}
                value={typeof draft.maxCharsTotal === "number" ? String(draft.maxCharsTotal) : "auto"}
                onChange={(v) => { if (v === "auto") setValue("maxCharsTotal", undefined, undefined); else setValue("maxCharsTotal", Number(v), undefined); }} />
            </div>
          </AdvancedDelay>
        </>
      );
    }

    // ------------------------------------------------------------------ Jina
    case "jina": {
      const engine = String(raw("fetchEngine", "auto"));
      const readerLm = raw("fetchReaderLmV2", false) === true;
      const cacheTolerance = raw("fetchCacheToleranceSec", undefined);
      const cacheKind: "auto" | "live" | "hour" | "day" = cacheTolerance === 0 ? "live" : cacheTolerance === 3600 ? "hour" : cacheTolerance === 86400 ? "day" : "auto";
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsJinaModeLabel")}</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <ChoiceCard selected={engine === "auto"} title={t("prefsJinaModeAuto")} description={t("prefsJinaModeAutoDesc")} badge={{ label: t("defaultBadge"), tone: "brand" }} onClick={() => setValue("fetchEngine", "auto", "auto")} />
              <ChoiceCard selected={engine === "curl"} title={t("prefsJinaModeDirect")} description={t("prefsJinaModeDirectDesc")} onClick={() => setValue("fetchEngine", "curl", "auto")} />
              <ChoiceCard selected={engine === "browser"} title={t("prefsJinaModeBrowser")} description={t("prefsJinaModeBrowserDesc")} onClick={() => setValue("fetchEngine", "browser", "auto")} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Switch checked={readerLm} onChange={(v) => setValue("fetchReaderLmV2", v, false)} label={t("prefsJinaReaderLmLabel")} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, color: text.primary }}>{t("prefsJinaReaderLmLabel")}</span>
              <span style={{ fontSize: 12, color: text.secondary }}>{t("prefsJinaReaderLmDesc")}</span>
            </span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsJinaCacheLabel")}</SectionLabel>
            <Segmented options={[{ value: "auto", label: t("prefsJinaCacheAuto") }, { value: "live", label: t("prefsJinaCacheLive") }, { value: "hour", label: t("prefsJinaCacheHour") }, { value: "day", label: t("prefsJinaCacheDay") }]}
              value={cacheKind} onChange={(v) => { if (v === "auto") setValue("fetchCacheToleranceSec", undefined, undefined); else if (v === "live") setValue("fetchCacheToleranceSec", 0, undefined); else if (v === "hour") setValue("fetchCacheToleranceSec", 3600, undefined); else setValue("fetchCacheToleranceSec", 86400, undefined); }} />
          </div>
          <AdvancedDelay t={t}>
            <NumberField label={t("prefsJinaMaxTokens")} hint={t("prefsJinaMaxTokensDesc")} value={typeof draft.fetchMaxTokens === "number" ? String(draft.fetchMaxTokens) : ""}
              onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchMaxTokens", undefined, undefined); else setValue("fetchMaxTokens", Math.round(n), undefined); }} />
            <NumberField label={t("prefsJinaTokenBudget")} hint={t("prefsJinaTokenBudgetDesc")} value={typeof draft.fetchTokenBudget === "number" ? String(draft.fetchTokenBudget) : ""}
              onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchTokenBudget", undefined, undefined); else setValue("fetchTokenBudget", Math.round(n), undefined); }} />
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

function AdvancedDelay(props: { t: TFunc; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" onClick={() => setOpen(!open)}
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 0", fontSize: 12, border: "none", background: "transparent", color: text.secondary, cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", display: "inline-flex" }}>
          <IconChevronRightOutline14 size={12} />
        </span>
        {props.t("moreSettings")}
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 8, borderRadius: 8, background: surface.layer1 }}>{props.children}</div>}
    </div>
  );
}