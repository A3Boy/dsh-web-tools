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
              fontWeight: selected ? 600 : 500,
              borderRadius: 8,
              cursor: disabled ? "not-allowed" : "pointer",
              border: `1px solid ${selected ? "var(--dsw-alias-brand-primary)" : surface.border}`,
              background: selected ? "color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)" : surface.layer2,
              color: selected ? "var(--dsw-alias-label-primary)" : text.secondary,
              fontFamily: "inherit",
              outline: "none",
              transition: "all .12s ease",
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
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
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
          <Button size="sm" variant="ghost" onClick={handleResetToDefaults} disabled={saving}>{t("prefsRestore")}</Button>
        </div>
      )}

      {msg && <div style={{ fontSize: 12, color: msg.tone === "error" ? stateColor.danger : stateColor.success, textAlign: "right" }}>{msg.text}</div>}
    </div>
  );
}

/** Per-provider control panels — fully i18n, Segmented single-choice with active description & subtle default hint. */
function ProviderControls(props: {
  t: TFunc;
  provider: string;
  draft: Record<string, unknown>;
  setValue: (key: string, value: unknown, defaultValue: unknown) => void;
  eff: Record<string, unknown>;
}) {
  const { t, provider, draft, setValue } = props;
  const raw = (key: string, fallback: unknown): unknown => draft[key] ?? fallback;

  switch (provider) {
    // ------------------------------------------------------------------ Exa
    case "exa": {
      const mode = String(raw("searchType", "auto"));
      const isCustomMode = mode !== "auto";
      const desc = mode === "fast" ? t("prefsExaFastDesc") : mode === "instant" ? t("prefsFastDesc") : mode.startsWith("deep") ? t("prefsExaDeepDesc") : t("prefsExaAutoDesc");
      const maxAgeHours = raw("maxAgeHours", undefined);
      const freshness: "auto" | "live" | "cache" = maxAgeHours === 0 ? "live" : maxAgeHours === -1 ? "cache" : "auto";
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsExaModeLabel")}</SectionLabel>
            <Segmented
              options={[
                { value: "auto", label: t("prefsExaAuto") },
                { value: "fast", label: t("prefsFast") },
                { value: "deep", label: t("prefsDeep") },
              ]}
              value={mode.startsWith("deep") ? "deep" : mode === "instant" ? "fast" : mode}
              onChange={(v) => setValue("searchType", v, "auto")}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }}>
              <span>{desc}</span>
              {isCustomMode && <span style={{ color: text.tertiary }}>{t("prefsDefaultValueHint", { v: t("prefsExaAuto") })}</span>}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsExaFreshnessLabel")}</SectionLabel>
            <Segmented
              options={[
                { value: "auto", label: t("prefsFreshnessAuto") },
                { value: "live", label: t("prefsFreshnessLive") },
                { value: "cache", label: t("prefsFreshnessCache") },
              ]}
              value={freshness}
              onChange={(v) => {
                if (v === "auto") setValue("maxAgeHours", undefined, undefined);
                else if (v === "live") setValue("maxAgeHours", 0, undefined);
                else setValue("maxAgeHours", -1, undefined);
              }}
            />
            <AdvancedDelay t={t}>
              <NumberField
                label={t("prefsExaFreshnessLabel") + " (h)"}
                hint={t("prefsExaMaxAgeHint")}
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
      const depth = String(raw("searchDepth", "basic"));
      const isCustomDepth = depth !== "basic";
      const desc = depth === "advanced" ? t("prefsTavilyAdvancedDesc") : depth === "fast" ? t("prefsTavilyFastDesc") : depth === "ultra-fast" ? t("prefsTavilyUltraFastDesc") : t("prefsTavilyBasicDesc");
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsTavilyDepthLabel")}</SectionLabel>
            <Segmented
              disabled={autoParams}
              options={[
                { value: "basic", label: t("prefsTavilyBasic") },
                { value: "advanced", label: t("prefsTavilyAdvanced") },
                { value: "fast", label: t("prefsTavilyFast") },
                { value: "ultra-fast", label: t("prefsTavilyUltraFast") },
              ]}
              value={depth}
              onChange={(v) => setValue("searchDepth", v, "basic")}
            />
            {!autoParams && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }}>
                <span>{desc}</span>
                {isCustomDepth && <span style={{ color: text.tertiary }}>{t("prefsDefaultValueHint", { v: t("prefsTavilyBasic") })}</span>}
              </div>
            )}
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
              <Segmented
                options={[{ value: "auto", label: t("prefsAutoLabel") }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]}
                value={typeof draft.chunksPerSource === "number" ? String(draft.chunksPerSource) : "auto"}
                onChange={(v) => { if (v === "auto") setValue("chunksPerSource", undefined, undefined); else setValue("chunksPerSource", Number(v), undefined); }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsTavilyExtractDepth")}</SectionLabel>
              <Segmented
                options={[{ value: "basic", label: t("prefsExtractBasic") }, { value: "advanced", label: t("prefsExtractAdvanced") }]}
                value={String(raw("fetchExtractDepth", "basic"))}
                onChange={(v) => setValue("fetchExtractDepth", v, "basic")}
              />
            </div>
          </AdvancedDelay>
        </>
      );
    }

    // ---------------------------------------------------------------- Brave
    case "brave": {
      const pref = String(raw("endpointPreference", "auto"));
      const isCustomPref = pref !== "auto";
      const desc = pref === "llm-context" ? t("prefsBraveLlmContextDesc") : pref === "web-search" ? t("prefsBraveWebSearchDesc") : t("prefsBraveAutoDesc");
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsBraveModeLabel")}</SectionLabel>
            <Segmented
              options={[
                { value: "auto", label: t("prefsBraveAuto") },
                { value: "llm-context", label: t("prefsBraveLlmContext") },
                { value: "web-search", label: t("prefsBraveWebSearch") },
              ]}
              value={pref}
              onChange={(v) => setValue("endpointPreference", v, "auto")}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }}>
              <span>{desc}</span>
              {isCustomPref && <span style={{ color: text.tertiary }}>{t("prefsDefaultValueHint", { v: t("prefsBraveAuto") })}</span>}
            </div>
          </div>
          <AdvancedDelay t={t}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsBraveThreshold")}</SectionLabel>
              <Segmented
                options={[
                  { value: "balanced", label: t("prefsBraveThresholdBalanced") },
                  { value: "strict", label: t("prefsBraveThresholdStrict") },
                  { value: "lenient", label: t("prefsBraveThresholdLenient") },
                  { value: "off", label: t("prefsBraveThresholdOff") },
                ]}
                value={String(raw("contextThresholdMode", "balanced"))}
                onChange={(v) => setValue("contextThresholdMode", v, "balanced")}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsBraveTokenBudget")}</SectionLabel>
              <Segmented
                options={[{ value: "auto", label: t("prefsAutoLabel") }, { value: "4000", label: "4K" }, { value: "8000", label: "8K" }, { value: "16000", label: "16K" }]}
                value={typeof draft.contextTokenBudget === "number" ? String(draft.contextTokenBudget) : "auto"}
                onChange={(v) => { if (v === "auto") setValue("contextTokenBudget", undefined, undefined); else setValue("contextTokenBudget", Number(v), undefined); }}
              />
            </div>
          </AdvancedDelay>
        </>
      );
    }

    // ---------------------------------------------------------------- You.com
    case "you": {
      const ext = String(raw("extractionMode", "highlights"));
      const isCustomExt = ext !== "highlights";
      const desc = ext === "none" ? t("prefsYouSummaryDesc") : t("prefsYouHighlightsDesc");
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsYouResultsLabel")}</SectionLabel>
            <Segmented
              options={[
                { value: "highlights", label: t("prefsYouHighlights") },
                { value: "none", label: t("prefsYouSummary") },
              ]}
              value={ext}
              onChange={(v) => setValue("extractionMode", v, "highlights")}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }}>
              <span>{desc}</span>
              {isCustomExt && <span style={{ color: text.tertiary }}>{t("prefsDefaultValueHint", { v: t("prefsYouHighlights") })}</span>}
            </div>
          </div>
          <AdvancedDelay t={t}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <NumberField
                label={t("prefsYouTimeoutSec")}
                value={typeof draft.fetchCrawlTimeoutSec === "number" ? String(draft.fetchCrawlTimeoutSec) : ""}
                onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchCrawlTimeoutSec", undefined, undefined); else setValue("fetchCrawlTimeoutSec", Math.round(n), undefined); }}
              />
              <NumberField
                label={t("prefsYouFreshnessSec")}
                value={typeof draft.fetchMaxAgeSec === "number" ? String(draft.fetchMaxAgeSec) : ""}
                onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchMaxAgeSec", undefined, undefined); else setValue("fetchMaxAgeSec", Math.round(n), undefined); }}
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
            <Segmented
              options={[
                { value: "auto", label: t("prefsFreshnessAuto") },
                { value: "live", label: t("prefsFreshnessLive") },
                { value: "day", label: t("prefsFirecrawl1Day") },
                { value: "week", label: t("prefsFirecrawl7Days") },
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
      const isCustomMode = mode !== "advanced";
      const desc = mode === "basic" ? t("prefsParallelBasicDesc") : mode === "fast" ? t("prefsParallelFastDesc") : mode === "turbo" ? t("prefsParallelTurboDesc") : t("prefsParallelAdvancedDesc");
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsParallelQualityLabel")}</SectionLabel>
            <Segmented
              options={[
                { value: "advanced", label: t("prefsParallelAdvanced") },
                { value: "basic", label: t("prefsParallelBasic") },
                { value: "fast", label: t("prefsParallelFast") },
                { value: "turbo", label: t("prefsParallelTurbo") },
              ]}
              value={mode}
              onChange={(v) => setValue("mode", v, "advanced")}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }}>
              <span>{desc}</span>
              {isCustomMode && <span style={{ color: text.tertiary }}>{t("prefsDefaultValueHint", { v: t("prefsParallelAdvanced") })}</span>}
            </div>
          </div>
          <AdvancedDelay t={t}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsParallelCharsLabel")}</SectionLabel>
              <Segmented
                options={[{ value: "auto", label: t("prefsAutoLabel") }, { value: "10000", label: t("prefsParallelCharsCompact") }, { value: "25000", label: t("prefsParallelCharsStandard") }, { value: "50000", label: t("prefsParallelCharsMore") }]}
                value={typeof draft.maxCharsTotal === "number" ? String(draft.maxCharsTotal) : "auto"}
                onChange={(v) => { if (v === "auto") setValue("maxCharsTotal", undefined, undefined); else setValue("maxCharsTotal", Number(v), undefined); }}
              />
            </div>
          </AdvancedDelay>
        </>
      );
    }

    // ------------------------------------------------------------------ Jina
    case "jina": {
      const engine = String(raw("fetchEngine", "auto"));
      const isCustomEngine = engine !== "auto";
      const desc = engine === "curl" ? t("prefsJinaModeDirectDesc") : engine === "browser" ? t("prefsJinaModeBrowserDesc") : t("prefsJinaModeAutoDesc");
      const readerLm = raw("fetchReaderLmV2", false) === true;
      const cacheTolerance = raw("fetchCacheToleranceSec", undefined);
      const cacheKind: "auto" | "live" | "hour" | "day" = cacheTolerance === 0 ? "live" : cacheTolerance === 3600 ? "hour" : cacheTolerance === 86400 ? "day" : "auto";
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsJinaModeLabel")}</SectionLabel>
            <Segmented
              options={[
                { value: "auto", label: t("prefsJinaModeAuto") },
                { value: "curl", label: t("prefsJinaModeDirect") },
                { value: "browser", label: t("prefsJinaModeBrowser") },
              ]}
              value={engine}
              onChange={(v) => setValue("fetchEngine", v, "auto")}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: text.secondary, minHeight: 18 }}>
              <span>{desc}</span>
              {isCustomEngine && <span style={{ color: text.tertiary }}>{t("prefsDefaultValueHint", { v: t("prefsJinaModeAuto") })}</span>}
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
            <Segmented
              options={[
                { value: "auto", label: t("prefsJinaCacheAuto") },
                { value: "live", label: t("prefsJinaCacheLive") },
                { value: "hour", label: t("prefsJinaCacheHour") },
                { value: "day", label: t("prefsJinaCacheDay") },
              ]}
              value={cacheKind}
              onChange={(v) => {
                if (v === "auto") setValue("fetchCacheToleranceSec", undefined, undefined);
                else if (v === "live") setValue("fetchCacheToleranceSec", 0, undefined);
                else if (v === "hour") setValue("fetchCacheToleranceSec", 3600, undefined);
                else setValue("fetchCacheToleranceSec", 86400, undefined);
              }}
            />
          </div>
          <AdvancedDelay t={t}>
            <NumberField
              label={t("prefsJinaMaxTokens")}
              hint={t("prefsJinaMaxTokensDesc")}
              value={typeof draft.fetchMaxTokens === "number" ? String(draft.fetchMaxTokens) : ""}
              onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchMaxTokens", undefined, undefined); else setValue("fetchMaxTokens", Math.round(n), undefined); }}
            />
            <NumberField
              label={t("prefsJinaTokenBudget")}
              hint={t("prefsJinaTokenBudgetDesc")}
              value={typeof draft.fetchTokenBudget === "number" ? String(draft.fetchTokenBudget) : ""}
              onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchTokenBudget", undefined, undefined); else setValue("fetchTokenBudget", Math.round(n), undefined); }}
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