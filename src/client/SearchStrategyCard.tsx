/**
 * dsh-web-tools — Search Mode card (搜索模式).
 *
 * Five user-facing modes: 推荐 / 快速 / 精准 / 节省 / 自定义. Picking a mode
 * applies a preset (per-provider options + preferred order) through the same
 * config/save gate; 自定义 hands control back to the manual order editor.
 *
 * No internal algorithms, no provider parameter names — just the outcome.
 * @module
 */
import { text, surface, accent } from "./theme.ts";
import type { SearchStrategy } from "./provider-presets.ts";
import type { TFunc } from "./logic.ts";

interface Props {
  t: TFunc;
  current: SearchStrategy;
  onApply: (strategy: SearchStrategy) => void;
  disabled?: boolean;
}

export function SearchStrategyCard(props: Props) {
  const { t, current, onApply, disabled } = props;
  const options: Array<{ id: SearchStrategy; icon: string; title: string; desc: string }> = [
    { id: "recommended", icon: "⭐", title: t("strategyRecommended"), desc: t("strategyRecommendedDesc") },
    { id: "fast", icon: "⚡", title: t("strategyFast"), desc: t("strategyFastDesc") },
    { id: "quality", icon: "🎯", title: t("strategyQuality"), desc: t("strategyQualityDesc") },
    { id: "cheap", icon: "💰", title: t("strategyCheap"), desc: t("strategyCheapDesc") },
    { id: "custom", icon: "⚙", title: t("strategyCustom"), desc: t("strategyCustomDesc") },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("strategyLabel")}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}
    >
      {options.map((o) => {
        const selected = o.id === current;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => { if (o.id !== current) onApply(o.id); }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              alignItems: "flex-start",
              padding: "9px 12px",
              borderRadius: 10,
              cursor: disabled ? "not-allowed" : "pointer",
              border: `1px solid ${selected ? accent.primary : surface.border}`,
              background: selected ? `color-mix(in srgb, ${accent.primary} 8%, transparent)` : surface.layer2,
              fontFamily: "inherit",
              fontSize: 13,
              color: text.primary,
              textAlign: "left",
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{o.icon}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{o.title}</span>
            </span>
            <span style={{ fontSize: 12, color: text.secondary, lineHeight: 1.4 }}>{o.desc}</span>
          </button>
        );
      })}
    </div>
  );
}