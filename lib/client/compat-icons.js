/**
 * dsh-web-tools — UI primitives icon compatibility, pure core (Issue #7).
 *
 * DSH 0.1.7 renamed the product icons from size-suffixed exports
 * (`IconChevronRightOutline14`, `IconSearchOutline16`, …) to stroke-suffixed
 * artwork (`…Regular` / `…Medium`), moving the size into a `size` prop. The old
 * names no longer exist on the primitives module in 0.1.7+, so importing them
 * DIRECTLY breaks twice over:
 *
 *  - at runtime they are `undefined`, and rendering `undefined` is React error
 *    #130 (the whole settings card dies), and
 *  - at type level `tsc` rejects the import whenever the primitives version used
 *    for type resolution is 0.1.7+, which happens as soon as a lockfile resolves
 *    the plugin's own (widened) peer range — independent of runtime.
 *
 * The FIRST attempt at this fix patched the old names onto the primitives
 * namespace. That cannot work: the web shell seeds its module table with a
 * namespace it has already frozen
 * (`Object.freeze(Object.defineProperty({…}, Symbol.toStringTag, …))`) and the
 * loader keeps that very reference
 * (`new Map(Object.entries(options.staticModules))`), so the assignment is a
 * silent no-op in a non-strict bundle. So the names are RESOLVED here instead of
 * written: this module reads the live namespace and never mutates it.
 *
 * This file deliberately imports nothing from the primitives package: the
 * binding lives in `./icons.ts`, so this resolution logic stays unit-testable in
 * plain Node (the primitives package pulls dependencies that only exist inside a
 * running DSH install).
 * @module
 */
import * as React from "react";
export const ICON_ALIASES = [
    ["IconChevronDownOutline14", "IconChevronDownOutlineRegular", 14],
    ["IconChevronRightOutline14", "IconChevronRightOutlineRegular", 14],
    ["IconGlobeOutline14", "IconGlobeOutlineRegular", 14],
    ["IconCloseOutline16", "IconCloseOutlineRegular", 16],
    ["IconEditOutline16", "IconEditOutlineRegular", 16],
    ["IconPlusOutline16", "IconPlusOutlineRegular", 16],
    ["IconRefreshOutline16", "IconRefreshOutlineRegular", 16],
    ["IconSearchOutline16", "IconSearchOutlineRegular", 16],
    ["IconSettingsOutline16", "IconSettingsOutlineRegular", 16],
    ["IconTrashOutline16", "IconTrashOutlineRegular", 16],
];
/**
 * Renders nothing. Undefined is what makes React throw #130 and take the whole
 * card down; an unrecognised future rename should cost one missing glyph.
 */
export const NULL_ICON = () => null;
/** Whether a module export can be rendered as a component. */
function isComponent(value) {
    return typeof value === "function" || (typeof value === "object" && value !== null);
}
/**
 * Resolve one icon against a primitives module.
 * @param module - The live primitives namespace (or any object with its exports).
 * @param spec - Legacy name, stroke-suffixed artwork name, and nominal size.
 * @returns A component safe to render on any host version.
 */
export function resolveIcon(module, spec) {
    const [legacyName, artworkName, nominalSize] = spec;
    if (module) {
        // A pre-0.1.7 host still publishes the size-suffixed export: keep its own
        // component (which carries its own default size).
        const legacy = module[legacyName];
        if (isComponent(legacy))
            return legacy;
        const artwork = module[artworkName];
        if (isComponent(artwork)) {
            return (props) => React.createElement(artwork, { size: nominalSize, ...props });
        }
    }
    return NULL_ICON;
}
