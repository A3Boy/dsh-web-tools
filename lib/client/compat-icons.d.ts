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
/** `[legacyName, strokeSuffixedArtwork, nominalSizePx]` — the single source of truth. */
export type IconAliasSpec = [legacyName: string, artworkName: string, nominalSize: number];
export declare const ICON_ALIASES: readonly IconAliasSpec[];
/** Any export usable as a component (function, or memo/forwardRef object). */
export type IconComponent = React.ComponentType<any>;
/**
 * Renders nothing. Undefined is what makes React throw #130 and take the whole
 * card down; an unrecognised future rename should cost one missing glyph.
 */
export declare const NULL_ICON: IconComponent;
/**
 * Resolve one icon against a primitives module.
 * @param module - The live primitives namespace (or any object with its exports).
 * @param spec - Legacy name, stroke-suffixed artwork name, and nominal size.
 * @returns A component safe to render on any host version.
 */
export declare function resolveIcon(module: Record<string, unknown> | undefined, spec: IconAliasSpec): IconComponent;
