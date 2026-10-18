/**
 * dsh-web-tools — the handful of Lucide icons this plugin draws itself.
 *
 * Inlined instead of adding `lucide-react` as a runtime dependency: the client
 * bundle is shipped as one `client.js`, and four extra-package icons are not
 * worth a new peer/dependency edge. Geometry is copied verbatim from
 * lucide-static (ISC, https://lucide.dev) so the artwork stays identical to the
 * upstream set; only the defaults differ (16px, 1.8 stroke as the product spec
 * asks). Colour inherits `currentColor`, so light/dark everywhere follows the
 * host theme.
 * @module
 */
import type { CSSProperties, ReactNode } from "react";

/** Shared icon props. */
export interface LucideIconProps {
  /** Square edge in px. Defaults to 16. */
  size?: number;
  /** Stroke width in the 24-viewBox space. Defaults to 1.8. */
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/** The one SVG frame every icon below reuses. */
function LucideSvg(props: LucideIconProps & { children: ReactNode }) {
  const size = props.size ?? 16;
  const strokeWidth = props.strokeWidth ?? 1.8;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      style={props.style}
      aria-hidden="true"
      focusable="false"
    >
      {props.children}
    </svg>
  );
}

/** `globe` — a mode that may reach the web. */
export function GlobeIcon(props: LucideIconProps) {
  return (
    <LucideSvg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </LucideSvg>
  );
}

/** `wifi-off` — web access switched off. */
export function WifiOffIcon(props: LucideIconProps) {
  return (
    <LucideSvg {...props}>
      <path d="M12 20h.01" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
      <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
      <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
      <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
      <path d="m2 2 20 20" />
    </LucideSvg>
  );
}

/** `refresh-cw` — the mode that repeats the lookup every turn. */
export function RefreshCwIcon(props: LucideIconProps) {
  return (
    <LucideSvg {...props}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </LucideSvg>
  );
}

/** `chevron-down` — "there is a menu here". */
export function ChevronDownIcon(props: LucideIconProps) {
  return (
    <LucideSvg {...props}>
      <path d="m6 9 6 6 6-6" />
    </LucideSvg>
  );
}

/** `check` — the active menu row. */
export function CheckIcon(props: LucideIconProps) {
  return (
    <LucideSvg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </LucideSvg>
  );
}
