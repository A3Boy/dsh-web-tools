import type { BrowserPlatform, RunningBrowserState } from "./types.ts";
export declare class StateStore {
    private readonly baseDirOverride?;
    constructor(baseDirOverride?: string);
    private getStateFilePath;
    loadState(platform: BrowserPlatform): RunningBrowserState | null;
    saveState(platform: BrowserPlatform, state: RunningBrowserState): void;
    clearState(platform: BrowserPlatform): void;
}
