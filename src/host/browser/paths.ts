import os from "node:os";
import path from "node:path";
import type { BrowserPlatform } from "./types.ts";

export function getDedicatedProfileDir(
  platform: BrowserPlatform,
  baseDirOverride?: string,
): string {
  const home = baseDirOverride || os.homedir();
  return path.join(home, ".dsh", "web-tools", "browser-profiles", platform);
}

export function getRuntimeStateDir(
  platform: BrowserPlatform,
  baseDirOverride?: string,
): string {
  const home = baseDirOverride || os.homedir();
  return path.join(home, ".dsh", "web-tools", "browser-runtime", platform);
}

export function validatePlatformUrl(urlStr: string, platform: BrowserPlatform): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (platform === "xiaohongshu") {
    return (
      hostname === "xiaohongshu.com" ||
      hostname.endsWith(".xiaohongshu.com") ||
      hostname === "xhslink.com" ||
      hostname.endsWith(".xhslink.com")
    );
  }

  if (platform === "x") {
    return (
      hostname === "x.com" ||
      hostname.endsWith(".x.com") ||
      hostname === "twitter.com" ||
      hostname.endsWith(".twitter.com")
    );
  }

  return false;
}
