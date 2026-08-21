/**
 * dsh-web-tools — SegmentedControl: modern unified container with elevated selected tab.
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
    <div
      role="radiogroup"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: 3,
        borderRadius: 9,
        background: surface.layer2,
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
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: isSm ? 26 : 30,
              padding: isSm ? "0 9px" : "0 12px",
              borderRadius: 7,
              border: "none",
              background: selected ? surface.layer1 : "transparent",
              color: selected ? text.primary : text.secondary,
              fontSize: 12,
              fontWeight: selected ? 600 : 400,
              fontFamily: "inherit",
              cursor: disabled ? "not-allowed" : "pointer",
              boxShadow: selected ? "0 1px 3px rgba(0,0,0,0.08), 0 1px 1px rgba(0,0,0,0.04)" : "none",
              transition: "all .12s cubic-bezier(0.4, 0, 0.2, 1)",
              whiteSpace: "nowrap",
              outline: "none",
              flex: "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
