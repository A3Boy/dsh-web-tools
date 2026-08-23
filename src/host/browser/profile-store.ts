import fs from "node:fs";
import path from "node:path";
import { getDedicatedProfileDir } from "./paths.ts";
import type { BrowserPlatform } from "./types.ts";

export interface ProfileMetadata {
  platform: BrowserPlatform;
  sessionEstablished: boolean;
  browserKind?: "edge" | "chrome";
  lastVerifiedAt?: number;
}

export class ProfileStore {
  private readonly baseDirOverride?: string;
  constructor(baseDirOverride?: string) {
    this.baseDirOverride = baseDirOverride;
  }

  getProfileDir(platform: BrowserPlatform): string {
    return getDedicatedProfileDir(platform, this.baseDirOverride);
  }

  private getMetadataPath(platform: BrowserPlatform): string {
    return path.join(this.getProfileDir(platform), "dsh-profile-meta.json");
  }

  ensureProfileDir(platform: BrowserPlatform): string {
    const dir = this.getProfileDir(platform);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  loadMetadata(platform: BrowserPlatform): ProfileMetadata | null {
    const metaPath = this.getMetadataPath(platform);
    if (!fs.existsSync(metaPath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      return {
        platform,
        sessionEstablished: Boolean(parsed.sessionEstablished),
        browserKind: parsed.browserKind,
        lastVerifiedAt: parsed.lastVerifiedAt,
      };
    } catch {
      return null;
    }
  }

  saveMetadata(platform: BrowserPlatform, meta: ProfileMetadata): void {
    this.ensureProfileDir(platform);
    const metaPath = this.getMetadataPath(platform);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
  }

  clearProfile(platform: BrowserPlatform): void {
    const dir = this.getProfileDir(platform);
    if (fs.existsSync(dir)) {
      // Synchronous recursive delete with retry for Windows lock file release
      let lastErr: any;
      for (let i = 0; i < 5; i++) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr && fs.existsSync(dir)) {
        throw new Error(`Failed to remove dedicated profile directory: ${lastErr.message}`);
      }
    }
  }
}
