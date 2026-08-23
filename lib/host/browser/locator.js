import fs from "node:fs";
import path from "node:path";
import process from "node:process";
export function locateBrowser(choice = "auto", fsModule = fs, platformOverride = process.platform, envOverride = process.env) {
    const isWindows = platformOverride === "win32";
    if (!isWindows) {
        if (platformOverride === "darwin") {
            const edgeMac = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
            const chromeMac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
            if ((choice === "edge" || choice === "auto") && fsModule.existsSync(edgeMac)) {
                return { kind: "edge", executablePath: edgeMac };
            }
            if ((choice === "chrome" || choice === "auto") && fsModule.existsSync(chromeMac)) {
                return { kind: "chrome", executablePath: chromeMac };
            }
        }
        else if (platformOverride === "linux") {
            const candidates = [
                { kind: "edge", path: "/usr/bin/microsoft-edge" },
                { kind: "chrome", path: "/usr/bin/google-chrome" },
                { kind: "chrome", path: "/usr/bin/chromium-browser" },
            ];
            for (const c of candidates) {
                if ((choice === "auto" || choice === c.kind) && fsModule.existsSync(c.path)) {
                    return { kind: c.kind, executablePath: c.path };
                }
            }
        }
        if (choice !== "auto" && choice !== "edge" && choice !== "chrome") {
            if (fsModule.existsSync(choice)) {
                const isEdge = choice.toLowerCase().includes("edge");
                return { kind: isEdge ? "edge" : "chrome", executablePath: choice };
            }
        }
        throw new Error(`No supported browser found on platform: ${platformOverride}`);
    }
    // Windows detection
    const progFiles = envOverride.ProgramFiles || "C:\\Program Files";
    const progFilesX86 = envOverride["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = envOverride.LOCALAPPDATA ||
        (envOverride.USERPROFILE ? path.join(envOverride.USERPROFILE, "AppData", "Local") : "");
    const edgeCandidates = [
        path.join(progFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(progFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
        localAppData ? path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe") : "",
    ].filter(Boolean);
    const chromeCandidates = [
        path.join(progFiles, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(progFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
        localAppData ? path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe") : "",
    ].filter(Boolean);
    if (choice !== "auto" && choice !== "edge" && choice !== "chrome") {
        if (fsModule.existsSync(choice)) {
            const isEdge = choice.toLowerCase().includes("edge");
            return { kind: isEdge ? "edge" : "chrome", executablePath: choice };
        }
        throw new Error(`Custom browser executable path not found: ${choice}`);
    }
    if (choice === "edge" || choice === "auto") {
        for (const p of edgeCandidates) {
            if (fsModule.existsSync(p))
                return { kind: "edge", executablePath: p };
        }
    }
    if (choice === "chrome" || choice === "auto") {
        for (const p of chromeCandidates) {
            if (fsModule.existsSync(p))
                return { kind: "chrome", executablePath: p };
        }
    }
    throw new Error("No supported Microsoft Edge or Google Chrome executable found on this system.");
}
