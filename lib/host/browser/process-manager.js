import { spawn } from "node:child_process";
import { allocateRandomPort } from "./port.js";
export function buildSafeLaunchArgs(profileDir, port, initialUrl) {
    const args = [
        `--user-data-dir=${profileDir}`,
        `--remote-debugging-address=127.0.0.1`,
        `--remote-debugging-port=${port}`,
        `--no-first-run`,
        `--no-default-browser-check`,
    ];
    if (initialUrl) {
        args.push(initialUrl);
    }
    return args;
}
export async function launchBrowserProcess(browser, profileDir, initialUrl) {
    const port = await allocateRandomPort();
    const args = buildSafeLaunchArgs(profileDir, port, initialUrl);
    const cp = spawn(browser.executablePath, args, {
        stdio: "ignore",
        detached: false,
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
