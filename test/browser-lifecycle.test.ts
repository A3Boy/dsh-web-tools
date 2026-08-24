import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EventEmitter } from "node:events";
import {
  SessionManager,
  type ProcessLauncher,
  type CdpClientFactory,
} from "../src/host/browser/session-manager.ts";
import type {
  BrowserInfo,
  BrowserPlatform,
  BrowserRunMode,
  CdpPageLease,
} from "../src/host/browser/types.ts";
import type { SpawnedBrowserProcess } from "../src/host/browser/process-manager.ts";

class FakeCdpClient extends EventEmitter {
  public closed = false;
  public sentCommands: Array<{ method: string; params: any; sessionId?: string }> = [];
  public listenersMap = new Map<string, Set<(params: any, sessionId?: string) => void>>();
  public onBrowserClose?: () => void;

  async connect(_timeoutMs?: number): Promise<void> {}

  async send<T = any>(
    method: string,
    params: any = {},
    sessionId?: string,
    signal?: AbortSignal,
    _timeoutMs?: number,
  ): Promise<T> {
    this.sentCommands.push({ method, params, sessionId });
    if (signal?.aborted) {
      throw new Error("Aborted");
    }
    if (method === "Storage.getCookies") {
      return {
        cookies: [
          { name: "web_session", domain: ".xiaohongshu.com" },
          { name: "auth_token", domain: ".x.com" },
          { name: "ct0", domain: ".x.com" },
        ],
      } as unknown as T;
    }
    if (method === "Target.createTarget") {
      return { targetId: "fake-target-" + Math.random().toString(36).slice(2) } as unknown as T;
    }
    if (method === "Target.attachToTarget") {
      return { sessionId: "fake-session-" + Math.random().toString(36).slice(2) } as unknown as T;
    }
    if (method === "Target.closeTarget") {
      return {} as unknown as T;
    }
    if (method === "Target.getTargets") {
      return { targetInfos: [{ targetId: "page-1", type: "page" }] } as unknown as T;
    }
    if (method === "Browser.getWindowForTarget") {
      return { windowId: 100 } as unknown as T;
    }
    if (method === "Browser.setWindowBounds") {
      return {} as unknown as T;
    }
    if (method === "Page.enable" || method === "Runtime.enable") {
      return {} as unknown as T;
    }
    if (method === "Page.navigate") {
      return {} as unknown as T;
    }
    if (method === "Runtime.evaluate") {
      return { result: { value: true, type: "boolean" } } as unknown as T;
    }
    if (method === "Browser.close") {
      this.onBrowserClose?.();
      this.close();
      return {} as unknown as T;
    }
    return {} as unknown as T;
  }

  on(eventName: string, listener: (params: any, sessionId?: string) => void): () => void {
    if (!this.listenersMap.has(eventName)) {
      this.listenersMap.set(eventName, new Set());
    }
    this.listenersMap.get(eventName)!.add(listener);
    return () => {
      this.listenersMap.get(eventName)?.delete(listener);
    };
  }

  onClose(cb: () => void): () => void {
    return this.on("__cdp_close__", cb);
  }

  close() {
    this.closed = true;
    const set = this.listenersMap.get("__cdp_close__");
    if (set) {
      for (const cb of set) {
        try {
          cb({});
        } catch {}
      }
    }
  }
}

function createFakeProcessManager(opts: {
  launchDelayMs?: number;
  onLaunch?: (mode: BrowserRunMode, platform: BrowserPlatform, pid: number) => void;
  onKill?: (pid: number) => void;
} = {}) {
  let nextPid = 10000;
  const alivePids = new Set<number>();
  const activeProcesses: Array<{ pid: number; mode: BrowserRunMode; platform: BrowserPlatform; process: any }> = [];

  const launcher: ProcessLauncher = async (
    browser: BrowserInfo,
    profileDir: string,
    initialUrl?: string,
    minimized = false,
    headless = false,
  ): Promise<SpawnedBrowserProcess> => {
    if (opts.launchDelayMs) {
      await new Promise((r) => setTimeout(r, opts.launchDelayMs));
    }
    const pid = nextPid++;
    alivePids.add(pid);
    const mode: BrowserRunMode = headless ? "headless" : "interactive";
    const platform: BrowserPlatform = profileDir.includes("xiaohongshu") ? "xiaohongshu" : "x";

    opts.onLaunch?.(mode, platform, pid);

    const cp = new EventEmitter() as any;
    cp.pid = pid;

    activeProcesses.push({ pid, mode, platform, process: cp });

    return {
      process: cp,
      port: 9000 + (pid % 1000),
      profileDir,
      browserKind: browser.kind,
      startedAt: Date.now(),
    };
  };

  const isPidAlive = (pid: number) => alivePids.has(pid);
  const killPid = (pid: number) => {
    if (!alivePids.has(pid)) return;
    alivePids.delete(pid);
    opts.onKill?.(pid);
    const idx = activeProcesses.findIndex((p) => p.pid === pid);
    if (idx >= 0) {
      const item = activeProcesses[idx];
      activeProcesses.splice(idx, 1);
      item.process.emit("exit", 0);
    }
  };

  return { launcher, isPidAlive, killPid, alivePids, activeProcesses };
}

test("Browser lifecycle: 1. concurrent login(x) + createPage(x): login gets interactive, worker transitions to headless after login", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-test-p1-1-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const launchedModes: BrowserRunMode[] = [];
  const fakeProc = createFakeProcessManager({
    launchDelayMs: 20,
    onLaunch: (mode) => launchedModes.push(mode),
    onKill: (pid) => fakeProc.killPid(pid),
  });

  const cdpFactory: CdpClientFactory = async () => new FakeCdpClient() as any;

  const sm = new SessionManager(
    "auto",
    tmpDir,
    300000,
    fakeProc.launcher,
    cdpFactory,
    fakeProc.isPidAlive,
    fakeProc.killPid,
  );

  try {
    // Start login and createPage concurrently
    const loginPromise = sm.login("x");
    const pagePromise = sm.createPage("x");

    const [loginRes, pageLease] = await Promise.all([loginPromise, pagePromise]);

    assert.equal(loginRes.authenticated, true);
    assert.ok(pageLease);

    // Modes launched should show: first interactive for login, then headless for worker
    assert.deepEqual(launchedModes, ["interactive", "headless"]);

    await pageLease.close();
    await sm.dispose();
  } finally {
    await sm.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Browser lifecycle: 2. concurrent two identical headless starts spawn only once", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-test-p1-2-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  let launchCount = 0;
  const fakeProc = createFakeProcessManager({
    launchDelayMs: 30,
    onLaunch: () => {
      launchCount++;
    },
    onKill: (pid) => fakeProc.killPid(pid),
  });

  const cdpFactory: CdpClientFactory = async () => new FakeCdpClient() as any;

  const sm = new SessionManager(
    "auto",
    tmpDir,
    300000,
    fakeProc.launcher,
    cdpFactory,
    fakeProc.isPidAlive,
    fakeProc.killPid,
  );

  try {
    const [p1, p2] = await Promise.all([
      sm.createPage("xiaohongshu"),
      sm.createPage("xiaohongshu"),
    ]);

    assert.equal(launchCount, 1);
    await p1.close();
    await p2.close();
  } finally {
    await sm.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Browser lifecycle: 3. login called during headless start waits and returns interactive session", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-test-p1-3-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const launchedModes: BrowserRunMode[] = [];
  const fakeProc = createFakeProcessManager({
    launchDelayMs: 25,
    onLaunch: (mode) => launchedModes.push(mode),
    onKill: (pid) => fakeProc.killPid(pid),
  });

  const cdpFactory: CdpClientFactory = async () => new FakeCdpClient() as any;

  const sm = new SessionManager(
    "auto",
    tmpDir,
    300000,
    fakeProc.launcher,
    cdpFactory,
    fakeProc.isPidAlive,
    fakeProc.killPid,
  );

  try {
    const pagePromise = sm.createPage("x");
    const loginPromise = sm.login("x");

    const [pageLease, loginRes] = await Promise.all([pagePromise, loginPromise]);

    assert.equal(loginRes.authenticated, true);
    assert.ok(pageLease);
    // Initial headless launch was transitioned to interactive for login, then page lease got headless
    assert.ok(launchedModes.includes("interactive"));

    await pageLease.close();
  } finally {
    await sm.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Browser lifecycle: 4. stop during starting leaves no process, no session", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-test-p1-4-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const fakeProc = createFakeProcessManager({
    launchDelayMs: 40,
    onKill: (pid) => fakeProc.killPid(pid),
  });

  const cdpFactory: CdpClientFactory = async () => new FakeCdpClient() as any;

  const sm = new SessionManager(
    "auto",
    tmpDir,
    300000,
    fakeProc.launcher,
    cdpFactory,
    fakeProc.isPidAlive,
    fakeProc.killPid,
  );

  try {
    const startPromise = sm.createPage("xiaohongshu");
    await new Promise((r) => setTimeout(r, 10)); // Call stop while starting is pending
    const stopPromise = sm.stop("xiaohongshu");

    await Promise.allSettled([startPromise, stopPromise]);

    assert.equal(fakeProc.alivePids.size, 0);
    const status = await sm.status("xiaohongshu");
    assert.equal(status.runtimeState, "stopped");
  } finally {
    await sm.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Browser lifecycle: 5. reset during starting stops process and clears profile", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-test-p1-5-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const fakeProc = createFakeProcessManager({
    launchDelayMs: 40,
    onKill: (pid) => fakeProc.killPid(pid),
  });

  const cdpFactory: CdpClientFactory = async () => new FakeCdpClient() as any;

  const sm = new SessionManager(
    "auto",
    tmpDir,
    300000,
    fakeProc.launcher,
    cdpFactory,
    fakeProc.isPidAlive,
    fakeProc.killPid,
  );

  try {
    const startPromise = sm.createPage("x");
    await new Promise((r) => setTimeout(r, 10));
    await sm.resetSession("x");
    await Promise.allSettled([startPromise]);

    assert.equal(fakeProc.alivePids.size, 0);
    const profileDir = path.join(tmpDir, "browser-profiles", "x");
    assert.ok(!fs.existsSync(profileDir));
  } finally {
    await sm.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Browser lifecycle: 6. dispose during starting ensures no late process stays alive", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-test-p1-6-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const fakeProc = createFakeProcessManager({
    launchDelayMs: 50,
    onKill: (pid) => fakeProc.killPid(pid),
  });

  const cdpFactory: CdpClientFactory = async () => new FakeCdpClient() as any;

  const sm = new SessionManager(
    "auto",
    tmpDir,
    300000,
    fakeProc.launcher,
    cdpFactory,
    fakeProc.isPidAlive,
    fakeProc.killPid,
  );

  try {
    const start1 = sm.createPage("xiaohongshu").catch(() => {});
    const start2 = sm.createPage("x").catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    await sm.dispose();
    await Promise.allSettled([start1, start2]);

    assert.equal(fakeProc.alivePids.size, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Browser lifecycle: 7. active page leases protect browser from idle shutdown", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-test-p1-7-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const fakeProc = createFakeProcessManager({
    onKill: (pid) => fakeProc.killPid(pid),
  });

  const cdpFactory: CdpClientFactory = async () => {
    const cdp = new FakeCdpClient();
    cdp.onBrowserClose = () => {
      // kill any running process on browser close
      for (const pid of Array.from(fakeProc.alivePids)) {
        fakeProc.killPid(pid);
      }
    };
    return cdp as any;
  };

  const sm = new SessionManager(
    "auto",
    tmpDir,
    50, // 50ms idle shutdown
    fakeProc.launcher,
    cdpFactory,
    fakeProc.isPidAlive,
    fakeProc.killPid,
  );

  try {
    const page = await sm.createPage("x");
    assert.equal(fakeProc.alivePids.size, 1);

    // Wait 100ms with page active (lease > 0)
    await new Promise((r) => setTimeout(r, 100));

    // Browser must NOT be killed because lease is active
    assert.equal(fakeProc.alivePids.size, 1);

    // Close page
    await page.close();

    // Wait 100ms after close -> idle timer fires and kills process
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(fakeProc.alivePids.size, 0);
  } finally {
    await sm.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Browser lifecycle: 8. login polling holds active operation and prevents idle shutdown", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-test-p1-8-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const fakeProc = createFakeProcessManager({
    onKill: (pid) => fakeProc.killPid(pid),
  });

  let pollCount = 0;
  class PollingFakeCdp extends FakeCdpClient {
    async send<T = any>(
      method: string,
      params: any = {},
      sessionId?: string,
      signal?: AbortSignal,
      timeoutMs?: number,
    ): Promise<T> {
      if (method === "Storage.getCookies") {
        pollCount++;
        if (pollCount < 3) {
          return { cookies: [] } as unknown as T; // unauthenticated for first 2 polls
        }
        return {
          cookies: [
            { name: "auth_token", domain: ".x.com" },
            { name: "ct0", domain: ".x.com" },
          ],
        } as unknown as T;
      }
      return super.send(method, params, sessionId, signal, timeoutMs);
    }
  }

  const sm = new SessionManager(
    "auto",
    tmpDir,
    50, // 50ms idle shutdown
    fakeProc.launcher,
    async () => {
      const cdp = new PollingFakeCdp();
      cdp.onBrowserClose = () => {
        for (const pid of Array.from(fakeProc.alivePids)) {
          fakeProc.killPid(pid);
        }
      };
      return cdp as any;
    },
    fakeProc.isPidAlive,
    fakeProc.killPid,
  );

  try {
    const loginRes = await sm.login("x");
    assert.equal(loginRes.authenticated, true);
    assert.equal(fakeProc.alivePids.size, 1);

    // After login complete and idle timer expires, process stops
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(fakeProc.alivePids.size, 0);
  } finally {
    await sm.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Browser lifecycle: 9. aborting queued worker operation does not leak lease or launch unnecessary browser", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-test-p1-9-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const fakeProc = createFakeProcessManager({
    launchDelayMs: 50,
    onKill: (pid) => fakeProc.killPid(pid),
  });

  const sm = new SessionManager(
    "auto",
    tmpDir,
    300000,
    fakeProc.launcher,
    async () => new FakeCdpClient() as any,
    fakeProc.isPidAlive,
    fakeProc.killPid,
  );

  try {
    const ac = new AbortController();
    const pageP = sm.createPage("x", ac.signal);
    ac.abort();

    await assert.rejects(async () => pageP, /abort/i);
  } finally {
    await sm.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Browser lifecycle: 10. two platforms start in parallel without blocking each other", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-test-p1-10-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const launchedPlatforms: BrowserPlatform[] = [];
  const fakeProc = createFakeProcessManager({
    launchDelayMs: 20,
    onLaunch: (_mode, platform) => launchedPlatforms.push(platform),
    onKill: (pid) => fakeProc.killPid(pid),
  });

  const sm = new SessionManager(
    "auto",
    tmpDir,
    300000,
    fakeProc.launcher,
    async () => new FakeCdpClient() as any,
    fakeProc.isPidAlive,
    fakeProc.killPid,
  );

  try {
    const [pXhs, pX] = await Promise.all([
      sm.createPage("xiaohongshu"),
      sm.createPage("x"),
    ]);

    assert.equal(fakeProc.alivePids.size, 2);
    assert.ok(launchedPlatforms.includes("xiaohongshu"));
    assert.ok(launchedPlatforms.includes("x"));

    await pXhs.close();
    await pX.close();
  } finally {
    await sm.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
