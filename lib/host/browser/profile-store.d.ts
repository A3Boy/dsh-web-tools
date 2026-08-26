import type { BrowserPlatform } from "./types.ts";
export interface ProfileMetadata {
    platform: BrowserPlatform;
    sessionEstablished: boolean;
    browserKind?: "edge" | "chrome";
    lastVerifiedAt?: number;
}
export declare class ProfileStore {
    private readonly baseDirOverride?;
    constructor(baseDirOverride?: string);
    getProfileDir(platform: BrowserPlatform): string;
    private getMetadataPath;
    ensureProfileDir(platform: BrowserPlatform): string;
    loadMetadata(platform: BrowserPlatform): ProfileMetadata | null;
    saveMetadata(platform: BrowserPlatform, meta: ProfileMetadata): void;
    clearProfile(platform: BrowserPlatform): void;
}
