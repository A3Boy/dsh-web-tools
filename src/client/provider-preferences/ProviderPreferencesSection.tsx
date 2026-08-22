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
import { Button, IconChevronRightOutline14, IconChevronDownOutline14, Menu, type MenuItem } from "@deepseek-ai/dsh-client-ui-primitives";
import { api } from "../api.ts";
import { text, surface, state as stateColor } from "../theme.ts";
import { Switch } from "../WebToolsSection.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { tavilyChunksVisible, PARALLEL_PRIMARY_MODES, PARALLEL_EXPERIMENTAL_MODES, EXA_SEARCH_TYPE_OPTIONS, exaPrimaryMode, exaPrimaryApplyable } from "./contracts.ts";

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
  onRestoreDraft?: (restore: () => void) => void;
  onCustomizedChange?: (customized: boolean) => void;
}

/** Modern Setting row input field with optional trailing addon/unit. */
function SettingInputRow(props: {
  label: string;
  hint?: string;
  value: string;
  unit?: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const { label, hint, value, unit, placeholder, onChange } = props;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: text.primary }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: text.tertiary }}>{hint}</span>}
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}>
        <input
          type="number"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{
            height: 32,
            width: 72,
            padding: "0 8px",
            borderRadius: 8,
            border: `1px solid ${surface.border}`,
            background: surface.layer2,
            color: text.primary,
            fontFamily: "inherit",
            fontSize: 13,
            textAlign: "center",
            boxSizing: "border-box",
            outline: "none",
          }}
        />
        {unit && <span style={{ fontSize: 13, color: text.secondary }}>{unit}</span>}
      </div>
    </div>
  );
}

/** Dropdown menu trigger for selecting expert options (>4 items). */
function DropdownSelect(props: {
  label: string;
  valueLabel: string;
  items: MenuItem[];
  onSelect: (id: string) => void;
}) {
  const { label, valueLabel, items, onSelect } = props;
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: text.primary }}>{label}</span>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        onSelect={(id) => {
          onSelect(id);
          setOpen(false);
        }}
        anchor={
          <button
            type="button"
            onClick={() => setOpen(!open)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              padding: "0 10px",
              borderRadius: 8,
              border: `1px solid ${surface.border}`,
              background: surface.layer2,
              color: text.primary,
              fontSize: 13,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <span>{valueLabel}</span>
            <span style={{ display: "inline-flex", color: text.tertiary }}>
              <IconChevronDownOutline14 size={14} />
            </span>
          </button>
        }
      />
    </div>
  );
}

export function ProviderPreferencesSection(props: Props) {
  const { t, p, onConfigChanged, onRestoreDraft, onCustomizedChange } = props;
  if (p.name === "searxng" || !p.options) return null;
  return (
    <PreferencesBody
      key={p.name}
      t={t}
      p={p}
      onConfigChanged={onConfigChanged}
      onRestoreDraft={onRestoreDraft}
      onCustomizedChange={onCustomizedChange}
    />
  );
}

function PreferencesBody(props: {
  t: TFunc;
  p: Props["p"];
  onConfigChanged: () => Promise<void> | void;
  onRestoreDraft?: (restore: () => void) => void;
  onCustomizedChange?: (customized: boolean) => void;
}) {
  const { t, p, onConfigChanged, onRestoreDraft, onCustomizedChange } = props;
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

  const isCustomized = !isDef || Object.keys(draft).length > 0;
  useEffect(() => {
    onCustomizedChange?.(isCustomized);
  }, [isCustomized, onCustomizedChange]);

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
      // On success, remain silent per design spec (no green "已保存" bar)
    } catch {
      setMsg({ text: t("prefsSaveFailed"), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setDraft({ ...savedOverrides }); setMsg(null); };
  const handleResetToDefaults = () => {
    setDraft({});
    setMsg(null);
  };

  useEffect(() => {
    if (onRestoreDraft) {
      onRestoreDraft(handleResetToDefaults);
    }
  }, [onRestoreDraft]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
      <ProviderControls
        t={t}
        provider={p.name}
        draft={draft}
        setValue={setValue}
        eff={eff}
        isCustomized={isCustomized}
        onRestoreDefault={handleResetToDefaults}
      />

      {dirty && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            borderRadius: 8,
            background: surface.layer2,
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 12, color: text.secondary }}>{t("prefsModified", { n: dirtyKeys.length })}</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>{t("prefsCancel")}</Button>
            <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>{saving ? t("prefsSaving") : t("prefsSave")}</Button>
          </span>
        </div>
      )}

      {msg && msg.tone === "error" && (
        <div style={{ fontSize: 12, color: stateColor.danger, textAlign: "right" }}>{msg.text}</div>
      )}
    </div>
  );
}

/** Per-provider control panels — fully i18n, Segmented single-choice with active description. */
function ProviderControls(props: {
  t: TFunc;
  provider: string;
  draft: Record<string, unknown>;
  setValue: (key: string, value: unknown, defaultValue: unknown) => void;
  eff: Record<string, unknown>;
  isCustomized: boolean;
  onRestoreDefault: () => void;
}) {
  const { t, provider, draft, setValue, isCustomized, onRestoreDefault } = props;
  const raw = (key: string, fallback: unknown): unknown => draft[key] ?? fallback;

  switch (provider) {
    // ------------------------------------------------------------------ Exa
    case "exa": {
      const mode = String(raw("searchType", "auto"));
      const desc = mode === "fast" ? t("prefsExaFastDesc") : mode === "instant" ? t("prefsFastDesc") : mode.startsWith("deep") ? t("prefsExaDeepDesc") : t("prefsExaAutoDesc");
      const maxAgeHours = raw("maxAgeHours", undefined);
      const freshness: "auto" | "live" | "cache" = maxAgeHours === 0 ? "live" : maxAgeHours === -1 ? "cache" : "auto";
      const handlePrimaryMode = (v: string) => {
        if (!exaPrimaryApplyable(v, mode)) return;
        setValue("searchType", v, "auto");
      };
      const primaryValue = exaPrimaryMode(mode);

      const exaNativeItems: MenuItem[] = EXA_SEARCH_TYPE_OPTIONS.map((m) => {
        const keyHint: Record<string, string> = {
          auto: "Auto",
          fast: "Fast",
          instant: "Instant",
          "deep-lite": "DeepLite",
          deep: "Deep",
          "deep-reasoning": "DeepReasoning",
        };
        return {
          id: m,
          label: t(`prefsExaNative${keyHint[m]}`),
        };
      });

      const currentNativeLabel = (() => {
        const keyHint: Record<string, string> = {
          auto: "Auto",
          fast: "Fast",
          instant: "Instant",
          "deep-lite": "DeepLite",
          deep: "Deep",
          "deep-reasoning": "DeepReasoning",
        };
        return t(`prefsExaNative${keyHint[mode] ?? "Auto"}`);
      })();

      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsExaModeLabel")}</SectionLabel>
            <SegmentedControl
              style={{ width: "100%" }}
              options={[
                { value: "auto", label: t("prefsExaAuto") },
                { value: "fast", label: t("prefsFast") },
                { value: "deep", label: t("prefsDeep") },
              ]}
              value={primaryValue}
              onChange={handlePrimaryMode}
            />
            <div style={{ fontSize: 12, color: text.secondary, minHeight: 18 }}>
              <span>{desc}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsExaFreshnessLabel")}</SectionLabel>
            <SegmentedControl
              style={{ width: "100%" }}
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
          </div>
          <AdvancedDelay t={t}>
            <DropdownSelect
              label={t("prefsExaNativeLabel")}
              valueLabel={currentNativeLabel}
              items={exaNativeItems}
              onSelect={(id) => setValue("searchType", id, "auto")}
            />
            <SettingInputRow
              label={t("prefsExaMaxAgeLabel")}
              unit={t("prefsHoursUnit")}
              value={typeof draft.maxAgeHours === "number" && draft.maxAgeHours > 0 ? String(draft.maxAgeHours) : ""}
              placeholder="24"
              onChange={(v) => {
                const n = Number(v);
                if (v === "" || Number.isNaN(n)) setValue("maxAgeHours", undefined, undefined);
                else setValue("maxAgeHours", Math.round(n), undefined);
              }}
            />
          </AdvancedDelay>
        </>
      );
    }

    // --------------------------------------------------------------- Tavily
    case "tavily": {
      const autoParams = raw("autoParameters", false) === true;
      const depth = String(raw("searchDepth", "basic"));
      const desc = depth === "advanced" ? t("prefsTavilyAdvancedDesc") : depth === "fast" ? t("prefsTavilyFastDesc") : depth === "ultra-fast" ? t("prefsTavilyUltraFastDesc") : t("prefsTavilyBasicDesc");
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsTavilyDepthLabel")}</SectionLabel>
            <SegmentedControl
              disabled={autoParams}
              style={{ width: "100%" }}
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
              <div style={{ fontSize: 12, color: text.secondary, minHeight: 18 }}>
                <span>{desc}</span>
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
            {tavilyChunksVisible(depth, autoParams) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <SectionLabel>{t("prefsTavilyChunksPerSource")}</SectionLabel>
                <SegmentedControl
                  style={{ width: "100%" }}
                  options={[{ value: "auto", label: t("prefsAutoLabel") }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]}
                  value={typeof draft.chunksPerSource === "number" ? String(draft.chunksPerSource) : "auto"}
                  onChange={(v) => { if (v === "auto") setValue("chunksPerSource", undefined, undefined); else setValue("chunksPerSource", Number(v), undefined); }}
                />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsTavilyExtractDepth")}</SectionLabel>
              <SegmentedControl
                style={{ width: "100%" }}
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
      const desc = pref === "llm-context" ? t("prefsBraveLlmContextDesc") : pref === "web-search" ? t("prefsBraveWebSearchDesc") : t("prefsBraveAutoDesc");
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsBraveModeLabel")}</SectionLabel>
            <SegmentedControl
              style={{ width: "100%" }}
              options={[
                { value: "auto", label: t("prefsBraveAuto") },
                { value: "llm-context", label: t("prefsBraveLlmContext") },
                { value: "web-search", label: t("prefsBraveWebSearch") },
              ]}
              value={pref}
              onChange={(v) => setValue("endpointPreference", v, "auto")}
            />
            <div style={{ fontSize: 12, color: text.secondary, minHeight: 18 }}>
              <span>{desc}</span>
            </div>
          </div>
          <AdvancedDelay t={t}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsBraveThreshold")}</SectionLabel>
              <SegmentedControl
                style={{ width: "100%" }}
                options={[
                  { value: "balanced", label: t("prefsBraveThresholdBalanced") },
                  { value: "strict", label: t("prefsBraveThresholdStrict") },
                  { value: "lenient", label: t("prefsBraveThresholdLenient") },
                  { value: "disabled", label: t("prefsBraveThresholdOff") },
                ]}
                value={String(raw("contextThresholdMode", "balanced"))}
                onChange={(v) => setValue("contextThresholdMode", v, "balanced")}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsBraveTokenBudget")}</SectionLabel>
              <SegmentedControl
                style={{ width: "100%" }}
                options={[{ value: "auto", label: t("prefsAutoLabel") }, { value: "4000", label: "4K" }, { value: "8000", label: "8K" }, { value: "16000", label: "16K" }, { value: "32000", label: "32K" }]}
                value={typeof draft.contextTokenBudget === "number" ? String(draft.contextTokenBudget) : "auto"}
                onChange={(v) => { if (v === "auto") setValue("contextTokenBudget", undefined, undefined); else setValue("contextTokenBudget", Number(v), undefined); }}
              />
              <span style={{ fontSize: 11, color: text.tertiary }}>{t("prefsBraveTokenBudgetAutoDesc")}</span>
            </div>
          </AdvancedDelay>
        </>
      );
    }

    // ---------------------------------------------------------------- You.com
    case "you": {
      const ext = String(raw("extractionMode", "highlights"));
      const desc = ext === "none" ? t("prefsYouSummaryDesc") : t("prefsYouHighlightsDesc");
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsYouResultsLabel")}</SectionLabel>
            <SegmentedControl
              style={{ width: "100%" }}
              options={[
                { value: "highlights", label: t("prefsYouHighlights") },
                { value: "none", label: t("prefsYouSummary") },
              ]}
              value={ext}
              onChange={(v) => setValue("extractionMode", v, "highlights")}
            />
            <div style={{ fontSize: 12, color: text.secondary, minHeight: 18 }}>
              <span>{desc}</span>
            </div>
          </div>
          <AdvancedDelay t={t}>
            <SettingInputRow
              label={t("prefsYouTimeoutSec")}
              hint={t("prefsYouTimeoutSecDesc")}
              unit={t("prefsSecondsUnit")}
              value={typeof draft.fetchCrawlTimeoutSec === "number" ? String(draft.fetchCrawlTimeoutSec) : ""}
              placeholder="10"
              onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchCrawlTimeoutSec", undefined, undefined); else setValue("fetchCrawlTimeoutSec", Math.round(n), undefined); }}
            />
            <SettingInputRow
              label={t("prefsYouFreshnessSec")}
              hint={t("prefsYouFreshnessSecDesc")}
              unit={t("prefsSecondsUnit")}
              value={typeof draft.fetchMaxAgeSec === "number" ? String(draft.fetchMaxAgeSec) : ""}
              placeholder="0"
              onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchMaxAgeSec", undefined, undefined); else setValue("fetchMaxAgeSec", Math.round(n), undefined); }}
            />
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
            <SegmentedControl
              style={{ width: "100%" }}
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
      const isExperimental = PARALLEL_EXPERIMENTAL_MODES.includes(mode as (typeof PARALLEL_EXPERIMENTAL_MODES)[number]);
      const primaryMode = isExperimental ? "advanced" : mode;
      const expMode: string = isExperimental ? mode : "off";
      const desc = mode === "basic"
        ? t("prefsParallelBasicDesc")
        : isExperimental
          ? t("prefsParallelExperimentalDesc")
          : t("prefsParallelAdvancedDesc");

      const parallelExpItems: MenuItem[] = [
        { id: "off", label: t("prefsParallelExperimentalOff") },
        ...PARALLEL_EXPERIMENTAL_MODES.map((m) => ({
          id: m,
          label: m === "fast" ? t("prefsParallelFast") : t("prefsParallelTurbo"),
        })),
      ];

      const currentExpLabel = expMode === "off"
        ? t("prefsParallelExperimentalOff")
        : expMode === "fast"
          ? t("prefsParallelFast")
          : t("prefsParallelTurbo");

      return (
        <>
          {isExperimental && (
            <div style={{ fontSize: 12, color: stateColor.warning, padding: "6px 10px", borderRadius: 8, background: surface.layer2, border: `1px solid ${stateColor.warning}55` }}>
              {t("prefsParallelExperimentalNote")}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsParallelQualityLabel")}</SectionLabel>
            <SegmentedControl
              style={{ width: "100%" }}
              options={PARALLEL_PRIMARY_MODES.map((m) => ({ value: m, label: m === "advanced" ? t("prefsParallelAdvanced") : t("prefsParallelBasic") }))}
              value={primaryMode}
              onChange={(v) => setValue("mode", v, "advanced")}
            />
            <div style={{ fontSize: 12, color: text.secondary, minHeight: 18 }}>
              <span>{desc}</span>
            </div>
          </div>
          <AdvancedDelay t={t}>
            <DropdownSelect
              label={t("prefsParallelExperimental")}
              valueLabel={currentExpLabel}
              items={parallelExpItems}
              onSelect={(id) => setValue("mode", id === "off" ? "advanced" : id, "advanced")}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>{t("prefsParallelCharsLabel")}</SectionLabel>
              <SegmentedControl
                style={{ width: "100%" }}
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
      const desc = engine === "curl" ? t("prefsJinaModeDirectDesc") : engine === "browser" ? t("prefsJinaModeBrowserDesc") : t("prefsJinaModeAutoDesc");
      const readerLm = raw("fetchReaderLmV2", false) === true;
      const cacheTolerance = raw("fetchCacheToleranceSec", undefined);
      const cacheKind: "auto" | "live" | "hour" | "day" = cacheTolerance === 0 ? "live" : cacheTolerance === 3600 ? "hour" : cacheTolerance === 86400 ? "day" : "auto";
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{t("prefsJinaModeLabel")}</SectionLabel>
            <SegmentedControl
              style={{ width: "100%" }}
              options={[
                { value: "auto", label: t("prefsJinaModeAuto") },
                { value: "curl", label: t("prefsJinaModeDirect") },
                { value: "browser", label: t("prefsJinaModeBrowser") },
              ]}
              value={engine}
              onChange={(v) => setValue("fetchEngine", v, "auto")}
            />
            <div style={{ fontSize: 12, color: text.secondary, minHeight: 18 }}>
              <span>{desc}</span>
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
            <SegmentedControl
              style={{ width: "100%" }}
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
            <SettingInputRow
              label={t("prefsJinaMaxTokens")}
              hint={t("prefsJinaMaxTokensDesc")}
              unit={t("prefsTokensUnit")}
              value={typeof draft.fetchMaxTokens === "number" ? String(draft.fetchMaxTokens) : ""}
              placeholder="e.g. 8000"
              onChange={(v) => { const n = Number(v); if (v === "" || Number.isNaN(n)) setValue("fetchMaxTokens", undefined, undefined); else setValue("fetchMaxTokens", Math.round(n), undefined); }}
            />
            <SettingInputRow
              label={t("prefsJinaTokenBudget")}
              hint={t("prefsJinaTokenBudgetDesc")}
              unit={t("prefsTokensUnit")}
              value={typeof draft.fetchTokenBudget === "number" ? String(draft.fetchTokenBudget) : ""}
              placeholder="e.g. 100000"
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
  return <span style={{ fontSize: 13, fontWeight: 500, color: text.primary }}>{props.children}</span>;
}

function AdvancedDelay(props: { t: TFunc; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 0",
          fontSize: 13,
          fontWeight: 500,
          border: "none",
          background: "transparent",
          color: text.secondary,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", display: "inline-flex" }}>
          <IconChevronRightOutline14 size={14} />
        </span>
        {props.t("advancedParamsTitle")}
      </button>
      {open && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginTop: 4,
            padding: "14px 16px",
            borderRadius: 10,
            background: surface.layer2,
            border: `1px solid ${surface.border}`,
          }}
        >
          {props.children}
        </div>
      )}
    </div>
  );
}
