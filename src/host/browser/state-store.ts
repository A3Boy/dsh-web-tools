import fs from "node:fs";
import path from "node:path";
import { getRuntimeStateDir } from "./paths.ts";
import type { BrowserPlatform, RunningBrowserState } from "./types.ts";

export class StateStore {
  private readonly baseDirOverride?: string;
  constructor(baseDirOverride?: string) {
    this.baseDirOverride = baseDirOverride;
  }

  private getStateFilePath(platform: BrowserPlatform): string {
    const dir = getRuntimeStateDir(platform, this.baseDirOverride);
    return path.join(dir, "runtime.json");
  }

  loadState(platform: BrowserPlatform): RunningBrowserState | null {
    const filePath = this.getStateFilePath(platform);
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);
      if (
        typeof parsed.pid === "number" &&
        typeof parsed.port === "number" &&
        typeof parsed.browserKind === "string" &&
        typeof parsed.profileDir === "string"
      ) {
        return parsed as RunningBrowserState;
      }
      return null;
    } catch {
      return null;
    }
  }

  saveState(platform: BrowserPlatform, state: RunningBrowserState): void {
    const filePath = this.getStateFilePath(platform);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  }

  clearState(platform: BrowserPlatform): void {
    const filePath = this.getStateFilePath(platform);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore removal error
      }
    }
  }
}
