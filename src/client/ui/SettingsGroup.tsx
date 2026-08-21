/**
 * dsh-web-tools — SettingsGroup & SettingsRow: unified setting layout primitives.
 *
 * - SettingsRow renders a REAL `<button>` when clickable (never a div with a
 *   role), and hover/focus states live in CSS, not JS inline styles.
 * - SettingsGroup supports a `dividers` prop ("none" | "inset" | "full") so
 *   row separators are drawn at the GROUP level without per-row props.
 * @module
 */
import { text, surface } from "../theme.ts";
import { IconChevronRightOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";

export function SettingsGroup(props: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  dividers?: "none" | "inset" | "full";
}) {
  const { title, action, children, style, dividers = "none" } = props;
  return (
    <>
      <style>{`
        .dswt-group-row {
          position: relative;
        }
        .dswt-group-dividers-inset .dswt-group-row + .dswt-group-row::before,
        .dswt-group-dividers-inset .dswt-group-row + *::before {
          display: none;
        }
        .dswt-group-dividers-inset .dswt-group-row + .dswt-group-row {
          box-shadow: inset 0 1px 0 ${surface.border};
        }
        .dswt-group-dividers-full .dswt-group-row + .dswt-group-row {
          box-shadow: none;
        }
        .dswt-group-dividers-full .dswt-group-row + .dswt-group-row::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: ${surface.border};
          pointer-events: none;
        }
        .dswt-group-dividers-inset .dswt-group-row + .dswt-group-row::after {
          content: "";
          position: absolute;
          top: 0;
          left: 48px;
          right: 0;
          height: 1px;
          background: ${surface.border};
          pointer-events: none;
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
        {(title || action) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
            {title && <span style={{ fontSize: 12, fontWeight: 600, color: text.tertiary, textTransform: "none" }}>{title}</span>}
            {action && <div>{action}</div>}
          </div>
        )}
        <div
          className={`dswt-group dswt-group-dividers-${dividers}`}
          style={{
            display: "flex",
            flexDirection: "column",
            borderRadius: 12,
            background: surface.layer1,
            border: `1px solid ${surface.border}`,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

export function SettingsRow(props: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  isLast?: boolean;
  insetDivider?: boolean;
  disabled?: boolean;
}) {
  const { icon, title, subtitle, trailing, chevron, onClick, disabled } = props;
  const isClickable = !!onClick && !disabled;

  const inner = (
    <>
      <style>{`
        .dswt-settings-row {
          width: 100%;
          box-sizing: border-box;
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          min-height: 48px;
          background: transparent;
          cursor: default;
          outline: none;
          transition: background .12s ease;
          opacity: ${disabled ? 0.6 : 1};
          border: none;
          margin: 0;
          text-align: left;
          font-family: inherit;
          color: inherit;
        }
        .dswt-settings-row.clickable {
          cursor: pointer;
        }
        .dswt-settings-row.clickable:hover {
          background: ${surface.hover};
        }
        .dswt-settings-row.clickable:active {
          background: ${surface.hover};
        }
        .dswt-settings-row.clickable:focus-visible {
          outline: 2px solid var(--dsw-alias-brand-primary, #4f8cff);
          outline-offset: -2px;
        }
        .dswt-settings-row:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
      `}</style>
      {icon && <div style={{ display: "inline-flex", alignItems: "center", flex: "none" }}>{icon}</div>}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: text.primary, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: text.tertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subtitle}
          </div>
        )}
      </div>
      {trailing && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}>
          {trailing}
        </div>
      )}
      {chevron && (
        <div style={{ display: "inline-flex", alignItems: "center", color: text.tertiary, flex: "none" }}>
          <IconChevronRightOutline14 size={14} />
        </div>
      )}
    </>
  );

  if (isClickable) {
    return (
      <button type="button" className={"dswt-settings-row clickable"} onClick={onClick} disabled={disabled}>
        {inner}
      </button>
    );
  }
  return (
    <div className="dswt-settings-row" aria-disabled={disabled === true}>
      {inner}
    </div>
  );
}