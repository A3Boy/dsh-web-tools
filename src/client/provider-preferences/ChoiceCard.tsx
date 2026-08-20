/**
 * dsh-web-tools — ChoiceCard: single-select radio card.
 *
 * Replaces native <select> for primary provider mode selection.
 * role=radio / radiogroup, DSH theme tokens, no large icons/gradients.
 * @module
 */
import { Pill } from "@deepseek-ai/dsh-client-ui-primitives";
import { text, surface, state as stateColor, accent } from "../theme.ts";

export interface ChoiceCardProps {
  selected: boolean;
  title: string;
  description?: string;
  /** Badge text e.g. "推荐", "已自定义". Rendered as Pill. */
  badge?: string;
  /** Meta text e.g. "1 credit", "~1s". Rendered as tertiary small text. */
  meta?: string;
  warning?: string;
  disabled?: boolean;
  onClick: () => void;
}

export function ChoiceCard(props: ChoiceCardProps) {
  const { selected, title, description, badge, meta, warning, disabled, onClick } = props;

  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={disabled ? -1 : 0}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 66,
        padding: "10px 12px",
        borderRadius: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        border: `1px solid ${selected ? accent.primary : surface.border}`,
        background: selected ? `color-mix(in srgb, ${accent.primary} 6%, transparent)` : surface.layer2,
        opacity: disabled ? 0.5 : 1,
        fontFamily: "inherit",
        fontSize: 14,
        color: text.primary,
        textAlign: "left",
        boxSizing: "border-box",
        transition: "border-color .12s ease, background .12s ease",
        outline: "none",
      }}
      onMouseEnter={(e) => {
        if (!disabled && !selected) e.currentTarget.style.background = surface.hover;
      }}
      onMouseLeave={(e) => {
        if (!disabled && !selected) e.currentTarget.style.background = surface.layer2;
      }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${accent.primary}40`; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: text.primary }}>{title}</span>
        {badge && (
          <Pill active={badge === "推荐"}>{badge}</Pill>
        )}
        {meta && <span style={{ marginLeft: "auto", fontSize: 11, color: text.tertiary, whiteSpace: "nowrap" }}>{meta}</span>}
      </div>
      {description && (
        <span style={{ fontSize: 12, color: text.secondary, lineHeight: 1.4 }}>{description}</span>
      )}
      {warning && selected && (
        <span style={{ fontSize: 11, color: stateColor.warning }}>{warning}</span>
      )}
    </div>
  );
}