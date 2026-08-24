import type { CdpPageLease } from "../../browser/types.ts";
import { type XhsPageState } from "../browser-scripts/xiaohongshu.ts";
export type XhsSearchNavigationState = XhsPageState | "navigation-failed";
export interface XhsSearchNavigationOutcome {
    state: XhsSearchNavigationState;
    url: string;
}
/** Enter XHS search through the visible home-page controls, never a direct search URL. */
export declare function navigateXhsSearchViaUi(page: CdpPageLease, query: string, signal?: AbortSignal): Promise<XhsSearchNavigationOutcome>;
