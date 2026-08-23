import os from "node:os";
import path from "node:path";
export function getDedicatedProfileDir(platform, baseDirOverride) {
    const home = baseDirOverride || os.homedir();
    return path.join(home, ".dsh", "web-tools", "browser-profiles", platform);
}
export function getRuntimeStateDir(platform, baseDirOverride) {
    const home = baseDirOverride || os.homedir();
    return path.join(home, ".dsh", "web-tools", "browser-runtime", platform);
}
export function validatePlatformUrl(urlStr, platform) {
    let parsed;
    try {
        parsed = new URL(urlStr);
    }
    catch {
        return false;
    }
    if (parsed.protocol !== "https:") {
        return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (platform === "xiaohongshu") {
        return (hostname === "xiaohongshu.com" ||
            hostname.endsWith(".xiaohongshu.com") ||
            hostname === "xhslink.com" ||
            hostname.endsWith(".xhslink.com"));
    }
    if (platform === "x") {
        return (hostname === "x.com" ||
            hostname.endsWith(".x.com") ||
            hostname === "twitter.com" ||
            hostname.endsWith(".twitter.com"));
    }
    return false;
}
