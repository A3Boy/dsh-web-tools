import fs from "node:fs";
import path from "node:path";
import { getRuntimeStateDir } from "./paths.js";
export class StateStore {
    baseDirOverride;
    constructor(baseDirOverride) {
        this.baseDirOverride = baseDirOverride;
    }
    getStateFilePath(platform) {
        const dir = getRuntimeStateDir(platform, this.baseDirOverride);
        return path.join(dir, "runtime.json");
    }
    loadState(platform) {
        const filePath = this.getStateFilePath(platform);
        if (!fs.existsSync(filePath))
            return null;
        try {
            const content = fs.readFileSync(filePath, "utf8");
            const parsed = JSON.parse(content);
            if (typeof parsed.pid === "number" &&
                typeof parsed.port === "number" &&
                typeof parsed.browserKind === "string" &&
                typeof parsed.profileDir === "string") {
                return parsed;
            }
            return null;
        }
        catch {
            return null;
        }
    }
    saveState(platform, state) {
        const filePath = this.getStateFilePath(platform);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
    }
    clearState(platform) {
        const filePath = this.getStateFilePath(platform);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            }
            catch {
                // Ignore removal error
            }
        }
    }
}
