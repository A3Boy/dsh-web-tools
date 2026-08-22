/**
 * dsh-web-tools — SegmentedControl: modern unified container with visible track and elevated selected tab.
 * @module
 */
import { text, surface } from "../theme.ts";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  title?: string;
}

interface Props<T extends string = string> {
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  /** Optional inline style override (e.g. width: "100%"). */
  style?: React.CSSProperties;
}

export function SegmentedControl<T extends string = string>(props: Props<T>) {
  const { options, value, onChange, disabled, size = "md", style } = props;
  const isSm = size === "sm";

  return (
    <>
      <style>{`
        .dswt-segmented-btn:focus-visible {
          outline: 2px solid var(--dsw-alias-brand-primary, #4f8cff);
          outline-offset: 1px;
          z-index: 1;
        }
      `}</style>
      <div
        role="radiogroup"
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: isSm ? 30 : 36,
          padding: 2,
          borderRadius: 9,
          background: "var(--dsw-alias-bg-layer-2, #f3f4f6)",
          border: `1px solid ${surface.borderStrong}`,
          boxSizing: "border-box",
          maxWidth: "100%",
          overflowX: "auto",
          ...style,
        }}
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              title={opt.title}
              onClick={() => onChange(opt.value)}
              className="dswt-segmented-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                padding: isSm ? "0 8px" : "0 12px",
                borderRadius: 7,
                border: "none",
                background: selected ? "var(--dsw-alias-bg-layer-1, #ffffff)" : "transparent",
                color: selected ? "var(--dsw-alias-brand-primary, #2b66ff)" : text.secondary,
                fontSize: 13,
                fontWeight: selected ? 500 : 400,
                fontFamily: "inherit",
                cursor: disabled ? "not-allowed" : "pointer",
                boxShadow: selected ? "0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" : "none",
                transition: "background .15s ease, color .15s ease, box-shadow .15s ease",
                whiteSpace: "nowrap",
                outline: "none",
                flex: style?.width === "100%" ? 1 : "none",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
