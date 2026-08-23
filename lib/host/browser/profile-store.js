import fs from "node:fs";
import { getDedicatedProfileDir } from "./paths.js";
export class ProfileStore {
    baseDirOverride;
    constructor(baseDirOverride) {
        this.baseDirOverride = baseDirOverride;
    }
    getProfileDir(platform) {
        return getDedicatedProfileDir(platform, this.baseDirOverride);
    }
    ensureProfileDir(platform) {
        const dir = this.getProfileDir(platform);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }
    clearProfile(platform) {
        const dir = this.getProfileDir(platform);
        if (fs.existsSync(dir)) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            }
            catch (err) {
                // Best-effort cleanup
            }
        }
    }
}
