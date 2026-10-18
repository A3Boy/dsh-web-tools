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
import type { CSSProperties } from "react";
/** Shared icon props. */
export interface LucideIconProps {
    /** Square edge in px. Defaults to 16. */
    size?: number;
    /** Stroke width in the 24-viewBox space. Defaults to 1.8. */
    strokeWidth?: number;
    className?: string;
    style?: CSSProperties;
}
/** `globe` — a mode that may reach the web. */
export declare function GlobeIcon(props: LucideIconProps): import("react").JSX.Element;
/** `wifi-off` — web access switched off. */
export declare function WifiOffIcon(props: LucideIconProps): import("react").JSX.Element;
/** `refresh-cw` — the mode that repeats the lookup every turn. */
export declare function RefreshCwIcon(props: LucideIconProps): import("react").JSX.Element;
/** `chevron-down` — "there is a menu here". */
export declare function ChevronDownIcon(props: LucideIconProps): import("react").JSX.Element;
/** `check` — the active menu row. */
export declare function CheckIcon(props: LucideIconProps): import("react").JSX.Element;
