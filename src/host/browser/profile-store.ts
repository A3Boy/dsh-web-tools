import fs from "node:fs";
import { getDedicatedProfileDir } from "./paths.ts";
import type { BrowserPlatform } from "./types.ts";

export class ProfileStore {
  private readonly baseDirOverride?: string;
  constructor(baseDirOverride?: string) {
    this.baseDirOverride = baseDirOverride;
  }

  getProfileDir(platform: BrowserPlatform): string {
    return getDedicatedProfileDir(platform, this.baseDirOverride);
  }

  ensureProfileDir(platform: BrowserPlatform): string {
    const dir = this.getProfileDir(platform);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  clearProfile(platform: BrowserPlatform): void {
    const dir = this.getProfileDir(platform);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        // Best-effort cleanup
      }
    }
  }
}
