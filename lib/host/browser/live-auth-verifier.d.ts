import { CdpClient } from "./cdp/client.ts";
import type { BrowserPlatform } from "./types.ts";
export interface LiveSessionVerificationContext {
    platform: BrowserPlatform;
    cdp: CdpClient;
    signal?: AbortSignal;
}
export type LiveSessionVerifier = (context: LiveSessionVerificationContext) => Promise<boolean>;
/** Verify browser-visible session usability after the cookie-presence gate. */
export declare const verifyLiveBrowserSession: LiveSessionVerifier;
