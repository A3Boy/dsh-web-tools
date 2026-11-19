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
import type { SpawnedBrowserProcess } from "../src/host/browser/process-manager.ts";
import {
  XiaohongshuSource,
  setXhsNativeSearchEnabled,
  isXhsNativeSearchEnabled,
} from "../src/host/sources/xiaohongshu.ts";

/**
 * Regression coverage for two release-blocking fixes:
 *
 * 1. The tab-hygiene sweep in createPage/closePlatformPages used to close
 *    EVERY same-platform page except the caller's own tab — including pages
 *    still held by a concurrent search / detail fetch. A second operation on
 *    the same platform could kill the first one's page mid-run. Active-lease
 *    target ids are now excluded from the sweep.
 *
 * 2. With XHS_NATIVE_SEARCH=0 the source returned a NON-retryable error, so
 *    the registry's routing guard returned it directly and the documented
 *    general-web degradation never happened. The outcome is now retryable.
 */

class TrackingCdpClient extends EventEmitter {
  public closed = false;
  public closedTargets: string[] = [];
  // targetId -> last known url; pre-seeded by the test to simulate pages that
  // an in-flight operation has already navigated to the platform domain.
  public targetUrls = new Map<string, string>();
  public listenersMap = new Map<string, Set<(params: any) => void>>();

  async connect(_timeoutMs?: number): Promise<void> {}

  async send<T = any>(
    method: string,
    params: any = {},
    _sessionId?: string,
    signal?: AbortSignal,
    _timeoutMs?: number,
  ): Promise<T> {
    if (signal?.aborted) throw new Error("Aborted");
    if (method === "Storage.getCookies") {
      return {
        cookies: [
          { name: "web_session", domain: ".xiaohongshu.com" },
          { name: "a1", domain: ".xiaohongshu.com" },
          { name: "auth_token", domain: ".x.com" },
          { name: "ct0", domain: ".x.com" },
        ],
      } as unknown as T;
    }
    if (method === "Target.createTarget") {
      const id = "fake-target-" + Math.random().toString(36).slice(2);
      this.targetUrls.set(id, params.url ?? "about:blank");
      return { targetId: id } as unknown as T;
    }
    if (method === "Target.attachToTarget") {
      return { sessionId: "fake-session-" + Math.random().toString(36).slice(2) } as unknown as T;
    }
    if (method === "Target.closeTarget") {
      this.closedTargets.push(params.targetId);
      this.targetUrls.delete(params.targetId);
      return {} as unknown as T;
    }
    if (method === "Target.getTargets") {
      const targetInfos = [...this.targetUrls.entries()].map(([targetId, url]) => ({
        targetId,
        type: "page",
        url,
      }));
      return { targetInfos } as unknown as T;
    }
    if (method === "Browser.getWindowForTarget") return { windowId: 100 } as unknown as T;
    if (method === "Page.enable" || method === "Runtime.enable") return {} as unknown as T;
    return {} as unknown as T;
  }

  on(eventName: string, listener: (params: any) => void): () => void {
    if (!this.listenersMap.has(eventName)) this.listenersMap.set(eventName, new Set());
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
    if (set) for (const cb of set) {
      try { cb({}); } catch {}
    }
  }
}

function buildManager(tmpDir: string) {
  const cdp = new TrackingCdpClient();
  let nextPid = 10000;
  const alivePids = new Set<number>();
  const launcher: ProcessLauncher = async (
    _browser,
    profileDir,
    _initialUrl,
    _minimized = false,
    headless = false,
  ): Promise<SpawnedBrowserProcess> => {
    const pid = nextPid++;
    alivePids.add(pid);
    const cp = new EventEmitter() as any;
    cp.pid = pid;
    return {
      process: cp,
      port: 9000 + (pid % 1000),
      profileDir,
      browserKind: "fake",
      startedAt: Date.now(),
    };
  };
  const isPidAlive = (pid: number) => alivePids.has(pid);
  const killPid = (pid: number) => {
    alivePids.delete(pid);
  };
  const cdpFactory: CdpClientFactory = async () => cdp as any;
  const sm = new SessionManager(
    "auto",
    tmpDir,
    300000,
    launcher,
    cdpFactory,
    isPidAlive,
    killPid,
  );
  return { sm, cdp };
}

test("sweep keeps pages held by an active lease while still closing stale leftovers", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-sweep-test-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const { sm, cdp } = buildManager(tmpDir);

  try {
    // Operation A opens its page (createPage registers the target as active).
    const pageA = await sm.createPage("xiaohongshu");
    // Simulate that A's in-flight operation has navigated its page to the
    // platform domain (exactly what a running search/detail fetch looks like).
    cdp.targetUrls.set(pageA.targetId, "https://www.xiaohongshu.com/explore");
    // A leftover tab from an EARLIER (finished) operation: same platform, no
    // live lease.
    cdp.targetUrls.set("stale-leftover", "https://www.xiaohongshu.com/search_result?keyword=x");

    // Operation B starts: its createPage sweeps same-platform leftovers.
    const pageB = await sm.createPage("xiaohongshu");

    const closed = cdp.closedTargets;
    assert.equal(
      closed.includes(pageA.targetId),
      false,
      "the sweep must never close a page whose lease is still active",
    );
    assert.ok(
      closed.includes("stale-leftover"),
      "the sweep must still close genuinely stale same-platform tabs",
    );

    await pageB.close();
    await pageA.close();
  } finally {
    await sm.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("XHS_NATIVE_SEARCH=0 marks the outcome retryable so the registry falls back to general web", async () => {
  const original = isXhsNativeSearchEnabled();
  setXhsNativeSearchEnabled(false);
  try {
    // The disabled-native path never touches the runtime, so a stub is enough.
    const stubRuntime = {
      status: async () => ({}),
    } as any;
    const source = new XiaohongshuSource(stubRuntime);
    const outcome = await source.search("test query", { maxResults: 3 });
    assert.ok(outcome.error, "disabled native search returns a routing error");
    assert.equal(
      outcome.error.retryable,
      true,
      "the error MUST be retryable: the registry only routes retryable failures to general-web discovery",
    );
    assert.match(outcome.error.message, /general web discovery/);
  } finally {
    setXhsNativeSearchEnabled(original);
  }
});
