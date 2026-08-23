import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ProfileStore } from "../src/host/browser/profile-store.ts";
import { StateStore } from "../src/host/browser/state-store.ts";
import { SessionManager } from "../src/host/browser/session-manager.ts";

test("ProfileStore & StateStore: zero raw cookie storage and metadata persistence", () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-browser-test-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const profileStore = new ProfileStore(tmpDir);
    const xhsDir = profileStore.ensureProfileDir("xiaohongshu");
    const xDir = profileStore.ensureProfileDir("x");

    assert.ok(fs.existsSync(xhsDir));
    assert.ok(fs.existsSync(xDir));
    assert.notEqual(xhsDir, xDir);

    // Save metadata
    profileStore.saveMetadata("xiaohongshu", {
      platform: "xiaohongshu",
      sessionEstablished: true,
      browserKind: "edge",
      lastVerifiedAt: 1234567,
    });

    const meta = profileStore.loadMetadata("xiaohongshu");
    assert.deepEqual(meta, {
      platform: "xiaohongshu",
      sessionEstablished: true,
      browserKind: "edge",
      lastVerifiedAt: 1234567,
    });

    const stateStore = new StateStore(tmpDir);
    stateStore.saveState("xiaohongshu", {
      pid: 99999,
      port: 12345,
      browserKind: "edge",
      profileDir: xhsDir,
      startedAt: 1000,
    });

    const loaded = stateStore.loadState("xiaohongshu");
    assert.deepEqual(loaded, {
      pid: 99999,
      port: 12345,
      browserKind: "edge",
      profileDir: xhsDir,
      startedAt: 1000,
    });

    // Zero cookie / credential fields in state or metadata
    assert.equal((loaded as any).cookies, undefined);
    assert.equal((loaded as any).auth_token, undefined);
    assert.equal((loaded as any).web_session, undefined);
    assert.equal((meta as any).cookies, undefined);

    stateStore.clearState("xiaohongshu");
    assert.equal(stateStore.loadState("xiaohongshu"), null);

    profileStore.clearProfile("xiaohongshu");
    assert.ok(!fs.existsSync(xhsDir));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SessionManager: status() returns stopped + auth unknown if metadata sessionEstablished is true", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-session-test-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const profileStore = new ProfileStore(tmpDir);
    profileStore.saveMetadata("xiaohongshu", {
      platform: "xiaohongshu",
      sessionEstablished: true,
      browserKind: "edge",
      lastVerifiedAt: 99999,
    });

    const sessionManager = new SessionManager("auto", tmpDir);
    const status = await sessionManager.status("xiaohongshu");

    assert.equal(status.runtimeState, "stopped");
    assert.equal(status.authenticated, false); // Cold-start unverified !== authenticated
    assert.equal(status.authState, "unknown");
    assert.equal(status.verifiedAt, 99999);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SessionManager: status() returns signed-out if no profile metadata exists", async () => {
  const tmpDir = path.join(os.tmpdir(), "dsh-session-test-empty-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const sessionManager = new SessionManager("auto", tmpDir);
    const status = await sessionManager.status("xiaohongshu");

    assert.equal(status.runtimeState, "stopped");
    assert.equal(status.authenticated, false);
    assert.equal(status.authState, "signed-out");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
