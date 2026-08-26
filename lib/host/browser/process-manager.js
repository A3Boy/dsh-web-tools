import { spawn } from "node:child_process";
import { allocateRandomPort } from "./port.js";
export function buildSafeLaunchArgs(profileDir, port, initialUrl, minimized = false, headless = false) {
    const args = [
        `--user-data-dir=${profileDir}`,
        `--remote-debugging-address=127.0.0.1`,
        `--remote-debugging-port=${port}`,
        `--no-first-run`,
        `--no-default-browser-check`,
    ];
    if (headless) {
        args.push("--headless=new");
    }
    else if (minimized) {
        args.push("--start-minimized");
    }
    if (initialUrl) {
        args.push(initialUrl);
    }
    return args;
}
export async function launchBrowserProcess(browser, profileDir, initialUrl, minimized = false, headless = false) {
    const port = await allocateRandomPort();
    const args = buildSafeLaunchArgs(profileDir, port, initialUrl, minimized, headless);
    const cp = spawn(browser.executablePath, args, {
        stdio: "ignore",
        detached: false,
    });
    await new Promise((resolve, reject) => {
        cp.once("spawn", () => {
            resolve();
        });
        cp.once("error", (err) => {
            reject(err);
        });
    });
    return {
        process: cp,
        port,
        profileDir,
        browserKind: browser.kind,
        startedAt: Date.now(),
    };
}
export function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        return e.code === "EPERM";
    }
}
