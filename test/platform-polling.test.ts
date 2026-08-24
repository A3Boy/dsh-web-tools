import assert from "node:assert/strict";
import test from "node:test";
import { shouldPollPlatformStatus, arePlatformStatusesEqual } from "../src/client/platform-polling.ts";
import type { PlatformStatusResponse } from "../src/shared/platform-types.ts";

test("Phase 4: 1. arePlatformStatusesEqual correctly detects changes and prevents redundant setState", () => {
  const s1: PlatformStatusResponse = {
    platforms: {
      xiaohongshu: {
        id: "xiaohongshu",
        name: "小红书",
        enabled: true,
        runtimeAvailable: true,
        runtimeState: "ready",
        authenticated: true,
      },
      x: {
        id: "x",
        name: "Twitter / X",
        enabled: true,
        runtimeAvailable: true,
        runtimeState: "stopped",
        authenticated: false,
      },
    },
  };

  const s2: PlatformStatusResponse = JSON.parse(JSON.stringify(s1));
  assert.equal(arePlatformStatusesEqual(s1, s2), true);

  s2.platforms.x.authenticated = true;
  assert.equal(arePlatformStatusesEqual(s1, s2), false);
});

test("Phase 4: 2. shouldPollPlatformStatus respects visibility and platform state", () => {
  // If document is hidden, do not poll
  assert.equal(shouldPollPlatformStatus(false, null), false);

  // If login is pending on either platform, poll frequently (2s)
  const pendingState: PlatformStatusResponse = {
    platforms: {
      xiaohongshu: {
        id: "xiaohongshu",
        name: "小红书",
        enabled: true,
        runtimeAvailable: true,
        runtimeState: "ready",
        authenticated: false,
        lastError: undefined,
      },
      x: {
        id: "x",
        name: "Twitter / X",
        enabled: true,
        runtimeAvailable: true,
        runtimeState: "starting",
        authenticated: false,
      },
    },
  };
  assert.equal(shouldPollPlatformStatus(true, pendingState), true);
});
