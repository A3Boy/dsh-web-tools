import { CdpClient } from "./cdp/client.ts";
import { fetchWebSocketDebuggerUrl } from "./cdp/connection.ts";
import { CdpPage } from "./cdp/page.ts";
import { UrlDisallowedError } from "./cdp/errors.ts";
import { locateBrowser } from "./locator.ts";
import { validatePlatformUrl } from "./paths.ts";
import { ProfileStore } from "./profile-store.ts";
import { StateStore } from "./state-store.ts";
import { verifyLiveBrowserSession, type LiveSessionVerifier } from "./live-auth-verifier.ts";
import { detectXhsPageState } from "./xiaohongshu-page-state.ts";
import { isPidAlive as defaultIsPidAlive, launchBrowserProcess, type SpawnedBrowserProcess } from "./process-manager.ts";
import type {
  BrowserInfo,
  BrowserPlatform,
  BrowserRunMode,
  BrowserSessionStatus,
  CdpPageLease,
  NativeBrowserRuntime,
  RunningBrowserState,
} from "./types.ts";

export type ProcessLauncher = (
  browser: BrowserInfo,
  profileDir: string,
  initialUrl?: string,
  minimized?: boolean,
  headless?: boolean,
) => Promise<SpawnedBrowserProcess>;

export type CdpClientFactory = (port: number, signal?: AbortSignal) => Promise<CdpClient>;
export type PidChecker = (pid: number) => boolean;
export type PidKiller = (pid: number) => void;

interface RunningSession {
  platform: BrowserPlatform;
  browser: BrowserInfo;
  port: number;
  pid?: number;
  cdp: CdpClient;
  profileDir: string;
  mode: BrowserRunMode;
  startedAt: number;
  process?: import("node:child_process").ChildProcess;
}

type PlatformLifecycleState =
  | "stopped"
  | "starting"
  | "ready"
  | "transitioning"
  | "stopping"
  | "error";

interface PlatformLifecycleRecord {
  platform: BrowserPlatform;
  state: PlatformLifecycleState;
  session?: RunningSession;
  targetMode?: BrowserRunMode;
  activeLeases: number;
  idleTimer?: NodeJS.Timeout;
  queue: Promise<unknown>;
  pendingCancel?: boolean;
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
    requiredCookies: ["a1", "web_session"],
    verifyPredicate: (names) => names.has("a1") && names.has("web_session"),
  },
  x: {
    initialUrl: "https://x.com/home",
    domains: ["x.com", "twitter.com"],
    requiredCookies: ["auth_token", "ct0"],
    verifyPredicate: (names) => names.has("auth_token") && names.has("ct0"),
  },
};

export class SessionManager implements NativeBrowserRuntime {
  private records = new Map<BrowserPlatform, PlatformLifecycleRecord>();
  private profileStore: ProfileStore;
  private stateStore: StateStore;
  private readonly browserChoice: "auto" | "edge" | "chrome" | string;
  private readonly idleShutdownMs: number;
  private readonly launcher: ProcessLauncher;
  private readonly cdpFactory: CdpClientFactory;
  private readonly isPidAliveFn: PidChecker;
  private readonly killPidFn: PidKiller;
  private readonly liveSessionVerifier: LiveSessionVerifier;
  private disposed = false;

  constructor(
    browserChoice: "auto" | "edge" | "chrome" | string = "auto",
    baseDirOverride?: string,
    idleShutdownMs = 300000,
    launcher: ProcessLauncher = launchBrowserProcess,
    cdpFactory: CdpClientFactory = async (port, signal) => {
      const wsUrl = await fetchWebSocketDebuggerUrl(port, 12000, signal);
      const cdp = new CdpClient(wsUrl);
      await cdp.connect(5000);
      return cdp;
    },
    isPidAliveFn: PidChecker = defaultIsPidAlive,
    killPidFn: PidKiller = (pid) => {
      try {
        process.kill(pid);
      } catch {}
    },
    liveSessionVerifier: LiveSessionVerifier = verifyLiveBrowserSession,
  ) {
    this.browserChoice = browserChoice;
    this.idleShutdownMs = idleShutdownMs;
    this.launcher = launcher;
    this.cdpFactory = cdpFactory;
    this.isPidAliveFn = isPidAliveFn;
    this.killPidFn = killPidFn;
    this.liveSessionVerifier = liveSessionVerifier;
    this.profileStore = new ProfileStore(baseDirOverride);
    this.stateStore = new StateStore(baseDirOverride);
  }

  private getRecord(platform: BrowserPlatform): PlatformLifecycleRecord {
    let rec = this.records.get(platform);
    if (!rec) {
      rec = {
        platform,
        state: "stopped",
        activeLeases: 0,
        queue: Promise.resolve(),
      };
      this.records.set(platform, rec);
    }
    return rec;
  }

  private enqueue<T>(platform: BrowserPlatform, task: () => Promise<T>): Promise<T> {
    const rec = this.getRecord(platform);
    const resultPromise = rec.queue.then(task, task);
    rec.queue = resultPromise.then(() => {}, () => {});
    return resultPromise;
  }

  async detect(): Promise<BrowserInfo | null> {
    try {
      return locateBrowser(this.browserChoice);
    } catch {
      return null;
    }
  }

  async checkAuthentication(platform: BrowserPlatform): Promise<boolean> {
    const session = await this.acquireSession(platform, "headless", undefined, undefined);
    return this.internalCheckAuth(session);
  }

  async verifyAuthenticationForOperation(
    platform: BrowserPlatform,
    signal?: AbortSignal,
    mode: BrowserRunMode = "headless",
  ): Promise<boolean> {
    try {
      // Metadata is only a cached observation. A transient page/target race can
      // make an earlier probe write `sessionEstablished: false` even though the
      // dedicated profile still contains valid cookies. Operations must verify
      // the real profile so the next search can self-heal without another login.
      const session = await this.acquireSession(platform, mode, undefined, signal);
      const isAuth = await this.internalCheckAuth(session, signal);
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

  private async internalCheckAuth(session: RunningSession, signal?: AbortSignal): Promise<boolean> {
    try {
      if (!await this.hasRequiredCookies(session)) return false;
      return await this.liveSessionVerifier({
        platform: session.platform,
        cdp: session.cdp,
        signal,
      });
    } catch {
      return false;
    }
  }

  private async hasRequiredCookies(session: RunningSession): Promise<boolean> {
    const config = PLATFORM_AUTH_CONFIG[session.platform];
    try {
      const res = await session.cdp.send<{
        cookies: Array<{ name: string; domain: string }>;
      }>("Storage.getCookies");
      const names = new Set(
        (res.cookies || [])
          .filter((cookie) => {
            const cookieDomain = (cookie.domain || "").toLowerCase().replace(/^\./, "");
            return config.domains.some((domain) => {
              const target = domain.toLowerCase().replace(/^\./, "");
              return cookieDomain === target || cookieDomain.endsWith("." + target);
            });
          })
          .map((cookie) => cookie.name),
      );
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

    const rec = this.getRecord(platform);
    if (rec.session) {
      const auth = await this.internalCheckAuth(rec.session);
      this.profileStore.saveMetadata(platform, {
        platform,
        sessionEstablished: auth,
        browserKind: rec.session.browser.kind,
        lastVerifiedAt: Date.now(),
      });
      return {
        platform,
        runtimeAvailable: true,
        runtimeState: "ready",
        browser: rec.session.browser,
        mode: rec.session.mode,
        authState: auth ? "authenticated" : "signed-out",
        authenticated: auth,
        sessionEstablished: auth,
        verifiedAt: Date.now(),
      };
    }

    // Check stored runtime.json for already running process
    const stored = this.stateStore.loadState(platform);
    if (stored && this.isPidAliveFn(stored.pid)) {
      try {
        const cdp = await this.cdpFactory(stored.port);
        const tempSession: RunningSession = {
          platform,
          browser: { kind: stored.browserKind, executablePath: browser.executablePath },
          port: stored.port,
          pid: stored.pid,
          cdp,
          profileDir: stored.profileDir,
          mode: stored.mode,
          startedAt: stored.startedAt,
        };
        cdp.onClose(() => {
          if (rec.session?.cdp === cdp) {
            rec.session = undefined;
            rec.state = "stopped";
            this.stateStore.clearState(platform);
          }
        });
        const authenticated = await this.internalCheckAuth(tempSession);
        this.profileStore.saveMetadata(platform, {
          platform,
          sessionEstablished: authenticated,
          browserKind: tempSession.browser.kind,
          lastVerifiedAt: Date.now(),
        });
        rec.session = tempSession;
        rec.state = "ready";
        this.scheduleIdleTimer(rec);
        return {
          platform,
          runtimeAvailable: true,
          runtimeState: "ready",
          browser,
          mode: tempSession.mode,
          authState: authenticated ? "authenticated" : "signed-out",
          authenticated,
          sessionEstablished: authenticated,
          verifiedAt: Date.now(),
        };
      } catch {
        this.stateStore.clearState(platform);
      }
    }

    // Check profile metadata: did user establish session previously?
    const meta = this.profileStore.loadMetadata(platform);
    if (meta && meta.sessionEstablished) {
      // Persisted metadata only proves that this profile established a session
      // before. Without a running browser, live usability is unknown even when
      // the previous verification was recent; the status route will probe it.
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

  async login(
    platform: BrowserPlatform,
    signal?: AbortSignal,
  ): Promise<BrowserSessionStatus> {
    if (this.disposed) throw new Error("NativeBrowserRuntime is disposed");
    if (signal?.aborted) throw new Error("Login aborted");

    const config = PLATFORM_AUTH_CONFIG[platform];

    // Login is an exclusive interactive operation.
    // It acquires an operation lease to prevent idle shutdown during polling.
    const rec = this.getRecord(platform);
    this.retainLease(rec);
    let loginPage: CdpPage | undefined;

    try {
      const session = await this.acquireSession(platform, "interactive", config.initialUrl, signal);

      // A new login attempt disarms stale metadata immediately. It becomes
      // established again only after cookies and live page usability agree.
      this.profileStore.saveMetadata(platform, {
        platform,
        sessionEstablished: false,
        browserKind: session.browser.kind,
        lastVerifiedAt: Date.now(),
      });

      loginPage = await this.prepareInteractiveLogin(session, config.initialUrl, signal);
      if (platform === "xiaohongshu" && !loginPage) {
        throw new Error("Unable to inspect the Xiaohongshu login page");
      }

      const start = Date.now();
      const timeoutMs = 300000; // 5 min timeout for manual interaction
      let authenticated = false;
      let consecutiveReadyStates = 0;

      while (Date.now() - start < timeoutMs) {
        if (signal?.aborted || this.disposed) throw new Error("Login aborted by user");
        const hasCookies = await this.hasRequiredCookies(session);
        if (platform === "xiaohongshu") {
          try {
            const pageState = hasCookies && loginPage
              ? await loginPage.call(detectXhsPageState, [], signal)
              : undefined;
            consecutiveReadyStates = pageState === "ready" ? consecutiveReadyStates + 1 : 0;
            authenticated = consecutiveReadyStates >= 2;
          } catch {
            consecutiveReadyStates = 0;
            authenticated = false;
          }
        } else {
          authenticated = hasCookies;
        }
        if (authenticated) {
          this.profileStore.saveMetadata(platform, {
            platform,
            sessionEstablished: true,
            browserKind: session.browser.kind,
            lastVerifiedAt: Date.now(),
          });
          // Minimize window after login success
          try {
            const targets = await session.cdp.send<{
              targetInfos: Array<{ targetId: string; type: string }>;
            }>("Target.getTargets");
            const pageTarget = targets.targetInfos?.find((t) => t.type === "page");
            if (pageTarget) {
              const boundsRes = await session.cdp.send<{ windowId: number }>(
                "Browser.getWindowForTarget",
                { targetId: pageTarget.targetId },
              );
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

      return {
        platform,
        runtimeAvailable: true,
        runtimeState: "ready",
        browser: session.browser,
        mode: session.mode,
        authState: authenticated ? "authenticated" : "signed-out",
        authenticated,
        verifiedAt: Date.now(),
        lastError: authenticated ? undefined : "Login timed out",
      };
    } finally {
      if (loginPage) {
        try {
          await rec.session?.cdp.send(
            "Target.detachFromTarget",
            { sessionId: loginPage.sessionId },
          );
        } catch {
          // Detaching the inspector must never close the user's login tab.
        }
      }
      this.releaseLease(rec);
    }
  }

  private async prepareInteractiveLogin(
    session: RunningSession,
    initialUrl: string,
    signal?: AbortSignal,
  ): Promise<CdpPage | undefined> {
    try {
      const targets = await session.cdp.send<{
        targetInfos: Array<{ targetId: string; type: string }>;
      }>("Target.getTargets");
      let pageTarget = targets.targetInfos?.find((t) => t.type === "page");

      if (!pageTarget) {
        const createRes = await session.cdp.send<{ targetId: string }>(
          "Target.createTarget",
          { url: "about:blank" },
          undefined,
          signal,
        );
        pageTarget = { targetId: createRes.targetId, type: "page" };
      }

      const attachRes = await session.cdp.send<{ sessionId: string }>(
        "Target.attachToTarget",
        { targetId: pageTarget.targetId, flatten: true },
        undefined,
        signal,
      );
      const page = new CdpPage(pageTarget.targetId, attachRes.sessionId, session.cdp, async () => {});
      await page.navigate(initialUrl, signal);

      const boundsRes = await session.cdp.send<{ windowId: number }>(
        "Browser.getWindowForTarget",
        { targetId: pageTarget.targetId },
      );
      if (boundsRes?.windowId) {
        await session.cdp.send("Browser.setWindowBounds", {
          windowId: boundsRes.windowId,
          bounds: { windowState: "normal" },
        });
      }
      return page;
    } catch {
      // Non-critical interactive prep error
      return undefined;
    }
  }

  async openPage(
    platform: BrowserPlatform,
    url: string,
    signal?: AbortSignal,
    mode: BrowserRunMode = "headless",
  ): Promise<CdpPageLease> {
    if (!validatePlatformUrl(url, platform)) {
      throw new UrlDisallowedError(url, platform);
    }

    const page = await this.createPage(platform, signal, mode);
    try {
      await page.navigate(url, signal);
      return page;
    } catch (err) {
      await page.close();
      throw err;
    }
  }

  async createPage(
    platform: BrowserPlatform,
    signal?: AbortSignal,
    mode: BrowserRunMode = "headless",
  ): Promise<CdpPageLease> {
    if (this.disposed) throw new Error("NativeBrowserRuntime is disposed");
    if (signal?.aborted) throw new Error("createPage aborted");

    const rec = this.getRecord(platform);
    this.retainLease(rec);

    try {
      const session = await this.acquireSession(platform, mode, undefined, signal);

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

      let closed = false;
      return new CdpPage(
        targetId,
        sessionId,
        session.cdp,
        async () => {
          if (closed) return;
          closed = true;
          try {
            await session.cdp.send("Target.closeTarget", { targetId });
          } catch {
            // Ignore closeTarget failure
          } finally {
            this.releaseLease(rec);
          }
        },
        (url) => {
          if (!validatePlatformUrl(url, platform)) {
            throw new UrlDisallowedError(url, platform);
          }
        },
      );
    } catch (err) {
      this.releaseLease(rec);
      throw err;
    }
  }

  private retainLease(rec: PlatformLifecycleRecord) {
    rec.activeLeases++;
    if (rec.idleTimer) {
      clearTimeout(rec.idleTimer);
      rec.idleTimer = undefined;
    }
  }

  private releaseLease(rec: PlatformLifecycleRecord) {
    if (rec.activeLeases > 0) {
      rec.activeLeases--;
    }
    if (rec.activeLeases === 0) {
      this.scheduleIdleTimer(rec);
    }
  }

  private scheduleIdleTimer(rec: PlatformLifecycleRecord) {
    if (rec.idleTimer) {
      clearTimeout(rec.idleTimer);
      rec.idleTimer = undefined;
    }
    if (this.idleShutdownMs > 0 && rec.activeLeases === 0 && rec.session && !this.disposed) {
      rec.idleTimer = setTimeout(() => {
        if (rec.activeLeases === 0) {
          this.stop(rec.platform).catch(() => {});
        }
      }, this.idleShutdownMs);
    }
  }

  private async acquireSession(
    platform: BrowserPlatform,
    desiredMode: BrowserRunMode,
    initialUrl?: string,
    signal?: AbortSignal,
  ): Promise<RunningSession> {
    return this.enqueue(platform, async () => {
      if (this.disposed) throw new Error("NativeBrowserRuntime is disposed");
      if (signal?.aborted) throw new Error("Operation aborted");

      const rec = this.getRecord(platform);

      // Check if current session matches desired mode
      if (rec.session && rec.state === "ready") {
        if (rec.session.mode === desiredMode) {
          return rec.session;
        }
        // Mode transition: stop existing browser before launching with desired mode
        rec.state = "transitioning";
        await this.internalStop(rec);
      }

      rec.state = "starting";
      rec.targetMode = desiredMode;
      rec.pendingCancel = false;

      const browser = await this.detect();
      if (!browser) {
        rec.state = "error";
        throw new Error("No supported browser (Edge / Chrome) found");
      }

      const profileDir = this.profileStore.ensureProfileDir(platform);
      const isVisible = desiredMode === "interactive";
      const config = PLATFORM_AUTH_CONFIG[platform];
      const startUrl = initialUrl || (isVisible ? config.initialUrl : undefined);

      let spawned: SpawnedBrowserProcess;
      try {
        spawned = await this.launcher(browser, profileDir, startUrl, isVisible, !isVisible);
      } catch (err) {
        rec.state = "error";
        throw err;
      }

      if (rec.pendingCancel || this.disposed || signal?.aborted) {
        if (spawned.process.pid) {
          this.killPidFn(spawned.process.pid);
        }
        rec.state = "stopped";
        throw new Error("Session acquisition cancelled");
      }

      let cdp: CdpClient;
      try {
        cdp = await this.cdpFactory(spawned.port, signal);
      } catch (err) {
        if (spawned.process.pid) {
          this.killPidFn(spawned.process.pid);
        }
        rec.state = "error";
        throw err;
      }

      if (rec.pendingCancel || this.disposed || signal?.aborted) {
        cdp.close();
        if (spawned.process.pid) {
          this.killPidFn(spawned.process.pid);
        }
        rec.state = "stopped";
        throw new Error("Session acquisition cancelled");
      }

      const session: RunningSession = {
        platform,
        browser,
        port: spawned.port,
        pid: spawned.process.pid,
        cdp,
        profileDir,
        mode: desiredMode,
        startedAt: spawned.startedAt,
        process: spawned.process,
      };

      cdp.onClose(() => {
        if (rec.session?.cdp === cdp) {
          rec.session = undefined;
          rec.state = "stopped";
          this.stateStore.clearState(platform);
        }
      });

      const state: RunningBrowserState = {
        pid: spawned.process.pid || 0,
        port: spawned.port,
        browserKind: browser.kind,
        profileDir,
        mode: desiredMode,
        startedAt: spawned.startedAt,
      };
      this.stateStore.saveState(platform, state);

      spawned.process.on("exit", () => {
        if (rec.session?.process === spawned.process) {
          rec.session = undefined;
          rec.state = "stopped";
          this.stateStore.clearState(platform);
        }
      });

      rec.session = session;
      rec.state = "ready";
      if (rec.activeLeases === 0) {
        this.scheduleIdleTimer(rec);
      }
      return session;
    });
  }

  private async internalStop(rec: PlatformLifecycleRecord): Promise<void> {
    rec.pendingCancel = true;
    if (rec.idleTimer) {
      clearTimeout(rec.idleTimer);
      rec.idleTimer = undefined;
    }

    const session = rec.session;
    rec.session = undefined;
    rec.state = "stopped";

    if (session) {
      try {
        await session.cdp.send("Browser.close", {}, undefined, undefined, 1000);
      } catch {
        // Fallback to socket close & kill
      }
      session.cdp.close();

      const pid = session.pid;
      if (pid) {
        let dead = !this.isPidAliveFn(pid);
        const start = Date.now();
        while (!dead && Date.now() - start < 500) {
          await new Promise((r) => setTimeout(r, 50));
          dead = !this.isPidAliveFn(pid);
        }

        if (!dead) {
          this.killPidFn(pid);
          const killStart = Date.now();
          while (!dead && Date.now() - killStart < 500) {
            await new Promise((r) => setTimeout(r, 50));
            dead = !this.isPidAliveFn(pid);
          }
        }
      }

      this.stateStore.clearState(rec.platform);
    }
  }

  async stop(platform: BrowserPlatform): Promise<void> {
    return this.enqueue(platform, async () => {
      const rec = this.getRecord(platform);
      await this.internalStop(rec);
    });
  }

  async resetSession(platform: BrowserPlatform): Promise<void> {
    await this.stop(platform);
    this.profileStore.clearProfile(platform);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const platforms = Array.from(this.records.keys());
    await Promise.all(platforms.map((p) => this.stop(p)));
  }
}
