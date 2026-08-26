import type { CdpPageLease } from "./types.ts";
export type XhsPageState = "ready" | "login-wall" | "security-verification" | "signed-out";
/** Browser-executed detector. Keep self-contained because CdpPage.call serializes it. */
export declare function detectXhsPageState(): XhsPageState;
/** Wait for hydration and require repeated observations before trusting page auth state. */
export declare function waitForStableXhsPageState(page: CdpPageLease, signal?: AbortSignal, options?: {
    settleMs?: number;
    intervalMs?: number;
    consecutive?: number;
    maxSamples?: number;
}): Promise<XhsPageState>;
