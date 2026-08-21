/**
 * dsh-web-tools — SoftChip: lightweight unbordered badge with brand-tinted background.
 * @module
 */
import { text } from "../theme.ts";

interface Props {
  children: React.ReactNode;
}

export function SoftChip({ children }: Props) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 20,
        padding: "0 6px",
        borderRadius: 6,
        background: "color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)",
        color: "var(--dsw-alias-brand-primary)",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: "nowrap",
        flex: "none",
      }}
    >
      {children}
    </span>
  );
}
