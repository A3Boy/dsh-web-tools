/**
 * dsh-web-tools — SegmentedControl: modern unified container with visible track and elevated selected tab.
 * @module
 */
import { adoptWebToolsStyles } from "./styles.ts";

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
  adoptWebToolsStyles();
  const { options, value, onChange, disabled, size = "md", style } = props;
  const isSm = size === "sm";

  return (
    <div
      role="radiogroup"
      className={`dswt-segmented-track ${isSm ? "dswt-segmented-track-sm" : ""}`}
      style={style}
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
            className={`dswt-segmented-btn ${isSm ? "dswt-segmented-btn-sm" : ""} ${selected ? "selected" : ""}`}
            style={{
              flex: style?.width === "100%" ? 1 : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
