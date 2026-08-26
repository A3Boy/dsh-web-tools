import type { BrowserPlatform } from "./types.ts";
export declare function getDedicatedProfileDir(platform: BrowserPlatform, baseDirOverride?: string): string;
export declare function getRuntimeStateDir(platform: BrowserPlatform, baseDirOverride?: string): string;
export declare function validatePlatformUrl(urlStr: string, platform: BrowserPlatform): boolean;
