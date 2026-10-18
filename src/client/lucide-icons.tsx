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

/** `radio-tower` — the mode that stays switched on every turn. */
export function RadioTowerIcon(props: LucideIconProps) {
  return (
    <LucideSvg {...props}>
      <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9" />
      <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" />
      <circle cx="12" cy="9" r="2" />
      <path d="M16.2 4.8c2 2 2.26 5.11.8 7.47" />
      <path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1" />
      <path d="M9.5 18h5" />
      <path d="m8 22 4-11 4 11" />
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
