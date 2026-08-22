/**
 * dsh-web-tools — SettingsGroup & SettingsRow: unified setting layout primitives.
 *
 * - SettingsRow renders a REAL `<button>` when clickable (never a div with a
 *   role), and hover/focus states live in CSS, not JS inline styles.
 * - SettingsGroup supports a `dividers` prop ("none" | "inset" | "full") so
 *   row separators are drawn at the GROUP level without per-row props.
 * @module
 */
import { adoptWebToolsStyles } from "./styles.ts";
import { IconChevronRightOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";

export function SettingsGroup(props: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  dividers?: "none" | "inset" | "full";
}) {
  adoptWebToolsStyles();
  const { title, action, children, style, dividers = "none" } = props;

  return (
    <div className="dswt-group-wrapper" style={style}>
      {(title || action) && (
        <div className="dswt-group-header">
          {title && <span className="dswt-group-title">{title}</span>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={`dswt-group-card dswt-group-dividers-${dividers}`}>
        {children}
      </div>
    </div>
  );
}

export function SettingsRow(props: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  isLast?: boolean;
  insetDivider?: boolean;
  disabled?: boolean;
}) {
  adoptWebToolsStyles();
  const { icon, title, subtitle, trailing, chevron, onClick, disabled } = props;
  const isClickable = !!onClick && !disabled;

  const inner = (
    <>
      {icon && <div className="dswt-row-icon">{icon}</div>}
      <div className="dswt-row-main">
        <div className="dswt-row-title">
          {typeof title === "string" ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          ) : (
            title
          )}
        </div>
        {subtitle && (
          <div className="dswt-row-subtitle">
            {subtitle}
          </div>
        )}
      </div>
      {trailing && (
        <div className="dswt-row-trailing">
          {trailing}
        </div>
      )}
      {chevron && (
        <div className="dswt-row-chevron">
          <IconChevronRightOutline14 size={14} />
        </div>
      )}
    </>
  );

  if (isClickable) {
    return (
      <button type="button" className="dswt-settings-row clickable" onClick={onClick} disabled={disabled}>
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
