import { CdpClient } from "./cdp/client.ts";
import { fetchWebSocketDebuggerUrl } from "./cdp/connection.ts";
import { CdpPage } from "./cdp/page.ts";
import { UrlDisallowedError } from "./cdp/errors.ts";
import { locateBrowser } from "./locator.ts";
import { validatePlatformUrl } from "./paths.ts";
import { ProfileStore } from "./profile-store.ts";
import { StateStore } from "./state-store.ts";
import { isPidAlive, launchBrowserProcess } from "./process-manager.ts";
import type {
  BrowserInfo,
  BrowserPlatform,
  BrowserSessionStatus,
  CdpPageLease,
  NativeBrowserRuntime,
  RunningBrowserState,
} from "./types.ts";

interface RunningSession {
  platform: BrowserPlatform;
  browser: BrowserInfo;
  port: number;
  pid?: number;
  cdp: CdpClient;
  profileDir: string;
  startedAt: number;
  process?: import("node:child_process").ChildProcess;
  idleTimer?: NodeJS.Timeout;
}

const PLATFORM_AUTH_CONFIG: Record<
  BrowserPlatform,
  {
    initialUrl: string;
    domains: string[];
    requiredCookies: string[];
    verifyPredicate: (cookieNames: Set<string>) => boolean;
  }
> = {
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

export class SessionManager implements NativeBrowserRuntime {
  private sessions = new Map<BrowserPlatform, RunningSession>();
  private startingPromises = new Map<BrowserPlatform, Promise<RunningSession>>();
  private profileStore: ProfileStore;
  private stateStore: StateStore;
  private readonly browserChoice: "auto" | "edge" | "chrome" | string;
  private readonly idleShutdownMs: number;

  constructor(
    browserChoice: "auto" | "edge" | "chrome" | string = "auto",
    baseDirOverride?: string,
    idleShutdownMs = 300000,
  ) {
    this.browserChoice = browserChoice;
    this.idleShutdownMs = idleShutdownMs;
    this.profileStore = new ProfileStore(baseDirOverride);
    this.stateStore = new StateStore(baseDirOverride);
  }

  async detect(): Promise<BrowserInfo | null> {
    try {
      return locateBrowser(this.browserChoice);
    } catch {
      return null;
    }
  }

  async checkAuthentication(platform: BrowserPlatform): Promise<boolean> {
    const session = await this.ensureSession(platform, undefined, false);
    return this.internalCheckAuth(session);
  }

  async verifyAuthenticationForOperation(
    platform: BrowserPlatform,
    signal?: AbortSignal,
  ): Promise<boolean> {
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
      } else {
        this.profileStore.saveMetadata(platform, {
          platform,
          sessionEstablished: false,
          browserKind: session.browser.kind,
          lastVerifiedAt: Date.now(),
        });
        return false;
      }
    } catch {
      return false;
    }
  }

  private async internalCheckAuth(session: RunningSession): Promise<boolean> {
    const config = PLATFORM_AUTH_CONFIG[session.platform];
    try {
      const res = await session.cdp.send<{
        cookies: Array<{ name: string; domain: string }>;
      }>("Storage.getCookies");
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
    } catch {
      return false;
    }
  }

  async status(platform: BrowserPlatform): Promise<BrowserSessionStatus> {
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
          const tempSession: RunningSession = {
            platform,
            browser: { kind: stored.browserKind, executablePath: browser.executablePath },
            port: stored.port,
            pid: stored.pid,
            cdp,
            profileDir: stored.profileDir,
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
        } catch {
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

  async login(
    platform: BrowserPlatform,
    signal?: AbortSignal,
  ): Promise<BrowserSessionStatus> {
    const config = PLATFORM_AUTH_CONFIG[platform];
    const session = await this.ensureSession(platform, config.initialUrl, true, signal);

    // Always navigate to the official login page and restore visibility,
    // even when reusing an existing stale/background session.
    await this.prepareInteractiveLogin(session, config.initialUrl, signal);

    const start = Date.now();
    const timeoutMs = 300000; // 5 min timeout for manual interaction
    let authenticated = false;

    while (Date.now() - start < timeoutMs) {
      if (signal?.aborted) throw new Error("Login aborted by user");
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
          const targets = await session.cdp.send<{ targetInfos: Array<{ targetId: string; type: string }> }>("Target.getTargets");
          const pageTarget = targets.targetInfos?.find((t) => t.type === "page");
          if (pageTarget) {
            const boundsRes = await session.cdp.send<{ windowId: number }>("Browser.getWindowForTarget", { targetId: pageTarget.targetId });
            if (boundsRes?.windowId) {
              await session.cdp.send("Browser.setWindowBounds", {
                windowId: boundsRes.windowId,
                bounds: { windowState: "minimized" },
              });
            }
          }
        } catch {
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

  private async prepareInteractiveLogin(
    session: RunningSession,
    initialUrl: string,
    signal?: AbortSignal,
  ): Promise<void> {
    // Navigate a page target to the login URL, or create one if none exists
    try {
      const targets = await session.cdp.send<{ targetInfos: Array<{ targetId: string; type: string }> }>("Target.getTargets");
      let pageTarget = targets.targetInfos?.find((t) => t.type === "page");

      if (pageTarget) {
        // Attach to existing page target and navigate to login URL
        const attachRes = await session.cdp.send<{ sessionId: string }>("Target.attachToTarget", {
          targetId: pageTarget.targetId,
          flatten: true,
        }, undefined, signal);
        const pageSessionId = attachRes.sessionId;
        await session.cdp.send("Page.enable", {}, pageSessionId, signal);
        await session.cdp.send("Page.navigate", { url: initialUrl }, pageSessionId, signal);
      } else {
        // Create a new page target
        const createRes = await session.cdp.send<{ targetId: string }>("Target.createTarget", { url: initialUrl }, undefined, signal);
        pageTarget = { targetId: createRes.targetId, type: "page" };
      }

      // Restore window to normal (visible) state
      if (pageTarget) {
        const boundsRes = await session.cdp.send<{ windowId: number }>("Browser.getWindowForTarget", { targetId: pageTarget.targetId });
        if (boundsRes?.windowId) {
          await session.cdp.send("Browser.setWindowBounds", {
            windowId: boundsRes.windowId,
            bounds: { windowState: "normal" },
          });
        }
      }
    } catch {
      // Non-critical: if interactive prep fails, login still proceeds with polling
    }
  }

  async openPage(
    platform: BrowserPlatform,
    url: string,
    signal?: AbortSignal,
  ): Promise<CdpPageLease> {
    if (!validatePlatformUrl(url, platform)) {
      throw new UrlDisallowedError(url, platform);
    }

    const session = await this.ensureSession(platform, undefined, false, signal);
    this.resetIdleTimer(session);

    // Create target in browser
    const createRes = await session.cdp.send<{ targetId: string }>(
      "Target.createTarget",
      { url: "about:blank" },
      undefined,
      signal,
    );
    const targetId = createRes.targetId;

    const attachRes = await session.cdp.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId, flatten: true },
      undefined,
      signal,
    );
    const sessionId = attachRes.sessionId;

    const page = new CdpPage(targetId, sessionId, session.cdp, async () => {
      try {
        await session.cdp.send("Target.closeTarget", { targetId });
      } catch {
        // Ignore close error
      }
      this.resetIdleTimer(session);
    });

    await page.navigate(url, signal);
    return page;
  }

  private async ensureSession(
    platform: BrowserPlatform,
    initialUrl?: string,
    visible = false,
    signal?: AbortSignal,
  ): Promise<RunningSession> {
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

        const spawned = await launchBrowserProcess(browser, profileDir, startUrl, !visible);
        const wsUrl = await fetchWebSocketDebuggerUrl(spawned.port, 12000, signal);

        const cdp = new CdpClient(wsUrl);
        await cdp.connect(5000);

        cdp.onClose(() => {
          if (this.sessions.get(platform)?.cdp === cdp) {
            this.sessions.delete(platform);
            this.stateStore.clearState(platform);
          }
        });

        const session: RunningSession = {
          platform,
          browser,
          port: spawned.port,
          pid: spawned.process.pid,
          cdp,
          profileDir,
          startedAt: spawned.startedAt,
          process: spawned.process,
        };

        const state: RunningBrowserState = {
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
      } finally {
        this.startingPromises.delete(platform);
      }
    })();

    this.startingPromises.set(platform, startPromise);
    return startPromise;
  }

  private resetIdleTimer(session: RunningSession) {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }
    if (this.idleShutdownMs > 0) {
      session.idleTimer = setTimeout(() => {
        this.stop(session.platform).catch(() => {});
      }, this.idleShutdownMs);
    }
  }

  async resetSession(platform: BrowserPlatform): Promise<void> {
    await this.stop(platform);
    this.profileStore.clearProfile(platform);
  }

  async stop(platform: BrowserPlatform): Promise<void> {
    const session = this.sessions.get(platform);
    if (session) {
      if (session.idleTimer) clearTimeout(session.idleTimer);
      try {
        await session.cdp.send("Browser.close", {}, undefined, undefined, 3000);
      } catch {
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
          } catch {}
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

  async dispose(): Promise<void> {
    const active = Array.from(this.sessions.keys());
    for (const p of active) {
      await this.stop(p);
    }
  }
}
