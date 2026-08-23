import type { BrowserPlatform } from "./types.ts";
export declare class ProfileStore {
    private readonly baseDirOverride?;
    constructor(baseDirOverride?: string);
    getProfileDir(platform: BrowserPlatform): string;
    ensureProfileDir(platform: BrowserPlatform): string;
    clearProfile(platform: BrowserPlatform): void;
}
