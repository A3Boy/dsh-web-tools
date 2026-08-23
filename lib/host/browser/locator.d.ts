import type { BrowserInfo } from "./types.js";
export declare function locateBrowser(choice?: "auto" | "edge" | "chrome" | string, fsModule?: {
    existsSync: (p: string) => boolean;
}, platformOverride?: string, envOverride?: Record<string, string | undefined>): BrowserInfo;
