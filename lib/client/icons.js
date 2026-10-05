/**
 * dsh-web-tools — the ten product icons this card uses, bound to the platform.
 *
 * The only module that imports `@deepseek-ai/dsh-client-ui-primitives` for
 * icons. It resolves each legacy name against the LIVE namespace (never writing
 * to it — the shell freezes it) and re-exports the result under the size-suffixed
 * name the rest of the tree already used.
 *
 * Kept separate from `./compat-icons.ts` so the resolution logic stays testable
 * in plain Node: importing the primitives package outside a running DSH install
 * drags in dependencies that are not resolvable there.
 * @module
 */
import * as primitives from "@deepseek-ai/dsh-client-ui-primitives";
import { ICON_ALIASES, resolveIcon } from "./compat-icons.js";
const host = primitives;
export const IconChevronDownOutline14 = resolveIcon(host, ICON_ALIASES[0]);
export const IconChevronRightOutline14 = resolveIcon(host, ICON_ALIASES[1]);
export const IconGlobeOutline14 = resolveIcon(host, ICON_ALIASES[2]);
export const IconCloseOutline16 = resolveIcon(host, ICON_ALIASES[3]);
export const IconEditOutline16 = resolveIcon(host, ICON_ALIASES[4]);
export const IconPlusOutline16 = resolveIcon(host, ICON_ALIASES[5]);
export const IconRefreshOutline16 = resolveIcon(host, ICON_ALIASES[6]);
export const IconSearchOutline16 = resolveIcon(host, ICON_ALIASES[7]);
export const IconSettingsOutline16 = resolveIcon(host, ICON_ALIASES[8]);
export const IconTrashOutline16 = resolveIcon(host, ICON_ALIASES[9]);
