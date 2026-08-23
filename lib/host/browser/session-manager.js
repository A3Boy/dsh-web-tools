import { CdpClient } from "./cdp/client.js";
import { fetchWebSocketDebuggerUrl } from "./cdp/connection.js";
import { CdpPage } from "./cdp/page.js";
import { UrlDisallowedError } from "./cdp/errors.js";
import { locateBrowser } from "./locator.js";
import { validatePlatformUrl } from "./paths.js";
import { ProfileStore } from "./profile-store.js";
import { StateStore } from "./state-store.js";
import { isPidAlive, launchBrowserProcess } from "./process-manager.js";
const PLATFORM_AUTH_CONFIG = {
    xiaohongshu: {
        initialUrl: "https://www.xiaohongshu.com/explore",
        domains: ["xiaohongshu.com"],
        requiredCookies: ["web_session"],
        verifyPredicate: (names) => names.has("web_session"),
    },
    x: {
        initialUrl: "https://x.com/home",
        domains: ["x.com", "twitter.com"],
        requiredCookies: ["auth_token", "ct0"],
        verifyPredicate: (names) => names.has("auth_token") && names.has("ct0"),
    },
};
export class SessionManager {
    sessions = new Map();
    startingPromises = new Map();
    profileStore;
    stateStore;
    browserChoice;
    idleShutdownMs;
    constructor(browserChoice = "auto", baseDirOverride, idleShutdownMs = 300000) {
        this.browserChoice = browserChoice;
        this.idleShutdownMs = idleShutdownMs;
        this.profileStore = new ProfileStore(baseDirOverride);
        this.stateStore = new StateStore(baseDirOverride);
    }
    async detect() {
        try {
            return locateBrowser(this.browserChoice);
        }
        catch {
            return null;
        }
    }
    async checkAuthentication(platform) {
        const session = await this.ensureSession(platform, undefined, false);
        return this.internalCheckAuth(session);
    }
    async verifyAuthenticationForOperation(platform, signal) {
        const meta = this.profileStore.loadMetadata(platform);
        if (!meta || !meta.sessionEstablished) {
            return false;
        }
        try {
            const session = await this.ensureSession(platform, undefined, false, signal);
            const isAuth = await this.internalCheckAuth(session);
            if (isAuth) {
                this.profileStore.saveMetadata(platform, {
                    platform,
                    sessionEstablished: true,
                    browserKind: session.browser.kind,
                    lastVerifiedAt: Date.now(),
                });
                return true;
            }
            else {
                this.profileStore.saveMetadata(platform, {
                    platform,
                    sessionEstablished: false,
                    browserKind: session.browser.kind,
                    lastVerifiedAt: Date.now(),
                });
                return false;
            }
        }
        catch {
            return false;
        }
    }
    async internalCheckAuth(session) {
        const config = PLATFORM_AUTH_CONFIG[session.platform];
        try {
            const res = await session.cdp.send("Storage.getCookies");
            const rawCookies = res.cookies || [];
            const matched = rawCookies.filter((c) => {
                const cookieDomain = (c.domain || "").toLowerCase().replace(/^\./, "");
                return config.domains.some((d) => {
                    const target = d.toLowerCase().replace(/^\./, "");
                    return cookieDomain === target || cookieDomain.endsWith("." + target);
                });
            });
            const names = new Set(matched.map((c) => c.name));
            return config.verifyPredicate(names);
        }
        catch {
            return false;
        }
    }
    async status(platform) {
        const browser = await this.detect();
        if (!browser) {
            return {
                platform,
                runtimeAvailable: false,
                runtimeState: "unavailable",
                authState: "unknown",
                authenticated: false,
            };
        }
        const running = this.sessions.get(platform);
        if (!running) {
            // Check stored runtime.json for already running process
            const stored = this.stateStore.loadState(platform);
            if (stored && isPidAlive(stored.pid)) {
                try {
                    const wsUrl = await fetchWebSocketDebuggerUrl(stored.port, 1200);
                    const cdp = new CdpClient(wsUrl);
                    await cdp.connect(1500);
                    const tempSession = {
                        platform,
                        browser: { kind: stored.browserKind, executablePath: browser.executablePath },
                        port: stored.port,
                        pid: stored.pid,
                        cdp,
                        profileDir: stored.profileDir,
                        mode: "headless",
                        startedAt: stored.startedAt,
                    };
                    cdp.onClose(() => {
                        if (this.sessions.get(platform)?.cdp === cdp) {
                            this.sessions.delete(platform);
                            this.stateStore.clearState(platform);
                        }
                    });
                    const authenticated = await this.internalCheckAuth(tempSession);
                    this.sessions.set(platform, tempSession);
                    this.resetIdleTimer(tempSession);
                    return {
                        platform,
                        runtimeAvailable: true,
                        runtimeState: "ready",
                        browser,
                        authState: authenticated ? "authenticated" : "signed-out",
                        authenticated,
                        verifiedAt: Date.now(),
                    };
                }
                catch {
                    this.stateStore.clearState(platform);
                }
            }
            // Check profile metadata: did user establish session previously?
            const meta = this.profileStore.loadMetadata(platform);
            if (meta && meta.sessionEstablished) {
                return {
                    platform,
                    runtimeAvailable: true,
                    runtimeState: "stopped",
                    browser,
                    authState: "unknown",
                    authenticated: false,
                    sessionEstablished: true,
                    verifiedAt: meta.lastVerifiedAt,
                };
            }
            return {
                platform,
                runtimeAvailable: true,
                runtimeState: "stopped",
                browser,
                authState: "signed-out",
                authenticated: false,
            };
        }
        const auth = await this.internalCheckAuth(running);
        return {
            platform,
            runtimeAvailable: true,
            runtimeState: "ready",
            browser: running.browser,
            authState: auth ? "authenticated" : "signed-out",
            authenticated: auth,
            verifiedAt: Date.now(),
        };
    }
    async login(platform, signal) {
        const config = PLATFORM_AUTH_CONFIG[platform];
        // Mode transition: a headless worker session cannot become interactive
        // (no window exists to "restore"). Stop it and relaunch with the SAME
        // dedicated profile as a visible browser for user login.
        const existing = this.sessions.get(platform);
        if (existing && existing.mode === "headless") {
            await this.stop(platform);
        }
        const session = await this.ensureSession(platform, config.initialUrl, true, signal);
        // Always navigate to the official login page and restore visibility,
        // even when reusing an existing stale/background session.
        await this.prepareInteractiveLogin(session, config.initialUrl, signal);
        const start = Date.now();
        const timeoutMs = 300000; // 5 min timeout for manual interaction
        let authenticated = false;
        while (Date.now() - start < timeoutMs) {
            if (signal?.aborted)
                throw new Error("Login aborted by user");
            authenticated = await this.internalCheckAuth(session);
            if (authenticated) {
                // Record non-secret session established metadata
                this.profileStore.saveMetadata(platform, {
                    platform,
                    sessionEstablished: true,
                    browserKind: session.browser.kind,
                    lastVerifiedAt: Date.now(),
                });
                // Minimize window after login success
                try {
                    const targets = await session.cdp.send("Target.getTargets");
                    const pageTarget = targets.targetInfos?.find((t) => t.type === "page");
                    if (pageTarget) {
                        const boundsRes = await session.cdp.send("Browser.getWindowForTarget", { targetId: pageTarget.targetId });
                        if (boundsRes?.windowId) {
                            await session.cdp.send("Browser.setWindowBounds", {
                                windowId: boundsRes.windowId,
                                bounds: { windowState: "minimized" },
                            });
                        }
                    }
                }
                catch {
                    // Ignore minimize failure
                }
                break;
            }
            await new Promise((r) => setTimeout(r, 1500));
        }
        this.resetIdleTimer(session);
        return {
            platform,
            runtimeAvailable: true,
            runtimeState: "ready",
            browser: session.browser,
            authState: authenticated ? "authenticated" : "signed-out",
            authenticated,
            verifiedAt: Date.now(),
            lastError: authenticated ? undefined : "Login timed out",
        };
    }
    async prepareInteractiveLogin(session, initialUrl, signal) {
        // Navigate a page target to the login URL, or create one if none exists
        try {
            const targets = await session.cdp.send("Target.getTargets");
            let pageTarget = targets.targetInfos?.find((t) => t.type === "page");
            if (pageTarget) {
                // Attach to existing page target and navigate to login URL
                const attachRes = await session.cdp.send("Target.attachToTarget", {
                    targetId: pageTarget.targetId,
                    flatten: true,
                }, undefined, signal);
                const pageSessionId = attachRes.sessionId;
                await session.cdp.send("Page.enable", {}, pageSessionId, signal);
                await session.cdp.send("Page.navigate", { url: initialUrl }, pageSessionId, signal);
            }
            else {
                // Create a new page target
                const createRes = await session.cdp.send("Target.createTarget", { url: initialUrl }, undefined, signal);
                pageTarget = { targetId: createRes.targetId, type: "page" };
            }
            // Restore window to normal (visible) state
            if (pageTarget) {
                const boundsRes = await session.cdp.send("Browser.getWindowForTarget", { targetId: pageTarget.targetId });
                if (boundsRes?.windowId) {
                    await session.cdp.send("Browser.setWindowBounds", {
                        windowId: boundsRes.windowId,
                        bounds: { windowState: "normal" },
                    });
                }
            }
        }
        catch {
            // Non-critical: if interactive prep fails, login still proceeds with polling
        }
    }
    async openPage(platform, url, signal) {
        if (!validatePlatformUrl(url, platform)) {
            throw new UrlDisallowedError(url, platform);
        }
        const session = await this.ensureSession(platform, undefined, false, signal);
        this.resetIdleTimer(session);
        // Create target in browser
        const createRes = await session.cdp.send("Target.createTarget", { url: "about:blank" }, undefined, signal);
        const targetId = createRes.targetId;
        const attachRes = await session.cdp.send("Target.attachToTarget", { targetId, flatten: true }, undefined, signal);
        const sessionId = attachRes.sessionId;
        const page = new CdpPage(targetId, sessionId, session.cdp, async () => {
            try {
                await session.cdp.send("Target.closeTarget", { targetId });
            }
            catch {
                // Ignore close error
            }
            this.resetIdleTimer(session);
        });
        await page.navigate(url, signal);
        return page;
    }
    async ensureSession(platform, initialUrl, visible = false, signal) {
        const existing = this.sessions.get(platform);
        if (existing) {
            return existing;
        }
        const starting = this.startingPromises.get(platform);
        if (starting) {
            return starting;
        }
        const startPromise = (async () => {
            try {
                const browser = await this.detect();
                if (!browser) {
                    throw new Error("No supported browser (Edge / Chrome) found");
                }
                const profileDir = this.profileStore.ensureProfileDir(platform);
                const config = PLATFORM_AUTH_CONFIG[platform];
                const startUrl = initialUrl || (visible ? config.initialUrl : undefined);
                // Worker (non-login) sessions always run headless: Agent never gets a
                // visible browser window, never steals focus, never shows in the taskbar.
                // Only explicit interactive login launches a real window.
                const spawned = await launchBrowserProcess(browser, profileDir, startUrl, false, !visible);
                const wsUrl = await fetchWebSocketDebuggerUrl(spawned.port, 12000, signal);
                const cdp = new CdpClient(wsUrl);
                await cdp.connect(5000);
                cdp.onClose(() => {
                    if (this.sessions.get(platform)?.cdp === cdp) {
                        this.sessions.delete(platform);
                        this.stateStore.clearState(platform);
                    }
                });
                const session = {
                    platform,
                    browser,
                    port: spawned.port,
                    pid: spawned.process.pid,
                    cdp,
                    profileDir,
                    mode: visible ? "interactive" : "headless",
                    startedAt: spawned.startedAt,
                    process: spawned.process,
                };
                const state = {
                    pid: spawned.process.pid || 0,
                    port: spawned.port,
                    browserKind: browser.kind,
                    profileDir,
                    startedAt: spawned.startedAt,
                };
                this.stateStore.saveState(platform, state);
                spawned.process.on("exit", () => {
                    if (this.sessions.get(platform)?.process === spawned.process) {
                        this.sessions.delete(platform);
                        this.stateStore.clearState(platform);
                    }
                });
                this.sessions.set(platform, session);
                this.resetIdleTimer(session);
                return session;
            }
            finally {
                this.startingPromises.delete(platform);
            }
        })();
        this.startingPromises.set(platform, startPromise);
        return startPromise;
    }
    resetIdleTimer(session) {
        if (session.idleTimer) {
            clearTimeout(session.idleTimer);
        }
        if (this.idleShutdownMs > 0) {
            session.idleTimer = setTimeout(() => {
                this.stop(session.platform).catch(() => { });
            }, this.idleShutdownMs);
        }
    }
    async resetSession(platform) {
        await this.stop(platform);
        this.profileStore.clearProfile(platform);
    }
    async stop(platform) {
        const session = this.sessions.get(platform);
        if (session) {
            if (session.idleTimer)
                clearTimeout(session.idleTimer);
            try {
                await session.cdp.send("Browser.close", {}, undefined, undefined, 3000);
            }
            catch {
                // Fallback
            }
            session.cdp.close();
            const pid = session.pid;
            if (pid) {
                // Wait up to 3 seconds for PID to die
                let dead = !isPidAlive(pid);
                const start = Date.now();
                while (!dead && Date.now() - start < 3000) {
                    await new Promise((r) => setTimeout(r, 150));
                    dead = !isPidAlive(pid);
                }
                if (!dead) {
                    try {
                        process.kill(pid);
                    }
                    catch { }
                    // Wait again up to 2 seconds after SIGTERM/kill
                    const killStart = Date.now();
                    while (!dead && Date.now() - killStart < 2000) {
                        await new Promise((r) => setTimeout(r, 100));
                        dead = !isPidAlive(pid);
                    }
                }
                if (!dead) {
                    throw new Error(`Browser process ${pid} did not exit after stop`);
                }
            }
            this.sessions.delete(platform);
            this.stateStore.clearState(platform);
        }
    }
    async dispose() {
        const active = Array.from(this.sessions.keys());
        for (const p of active) {
            await this.stop(p);
        }
    }
}
