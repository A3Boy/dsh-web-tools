import { type ChildProcess } from "node:child_process";
import type { BrowserInfo } from "./types.ts";
export interface SpawnedBrowserProcess {
    process: ChildProcess;
    port: number;
    profileDir: string;
    browserKind: "edge" | "chrome";
    startedAt: number;
}
export declare function buildSafeLaunchArgs(profileDir: string, port: number, initialUrl?: string, minimized?: boolean): string[];
export declare function launchBrowserProcess(browser: BrowserInfo, profileDir: string, initialUrl?: string, minimized?: boolean): Promise<SpawnedBrowserProcess>;
export declare function isPidAlive(pid: number): boolean;
