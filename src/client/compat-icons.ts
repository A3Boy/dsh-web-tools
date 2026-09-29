/**
 * dsh-web-tools — DSH 0.1.7 UI primitives icon compatibility (Issue #7).
 *
 * In DSH 0.1.7+, @deepseek-ai/dsh-client-ui-primitives renamed size-suffixed icon
 * exports (e.g. IconChevronDownOutline14, IconSearchOutline16) to stroke-suffixed
 * exports (IconChevronDownOutlineRegular, IconSearchOutlineRegular).
 *
 * This module ensures backwards and forwards compatibility by creating aliases
 * with nominal sizes when old names are absent on the primitives export.
 * @module
 */
import * as React from "react";

export type IconAliasSpec = [oldName: string, newName: string, nominalSize: number];

export const ICON_ALIASES: readonly IconAliasSpec[] = [
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

export function patchPrimitivesIcons(target?: Record<string, any>): void {
  if (!target || typeof target !== "object") return;
  for (const [oldName, newName, nominalSize] of ICON_ALIASES) {
    if (target[oldName] !== undefined) continue;
    const Artwork = target[newName];
    if (Artwork === undefined) continue;
    target[oldName] = (props: any) =>
      React.createElement(Artwork, { size: nominalSize, ...props });
  }
}
