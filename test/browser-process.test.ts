import assert from "node:assert/strict";
import test from "node:test";
import { buildSafeLaunchArgs } from "../src/host/browser/process-manager.ts";
import { validatePlatformUrl } from "../src/host/browser/paths.ts";

test("ProcessManager: safe args enforce security invariants", () => {
  const args = buildSafeLaunchArgs("C:\\profiles\\xhs", 9222, "https://www.xiaohongshu.com/explore");

  assert.ok(args.includes("--user-data-dir=C:\\profiles\\xhs"));
  assert.ok(args.includes("--remote-debugging-address=127.0.0.1"));
  assert.ok(args.includes("--remote-debugging-port=9222"));

  // Check forbidden dangerous flags
  assert.ok(!args.some((a) => a.includes("--disable-web-security")));
  assert.ok(!args.some((a) => a.includes("--no-sandbox")));
  assert.ok(!args.some((a) => a.includes("--remote-allow-origins=*")));
  assert.ok(!args.some((a) => a.includes("--ignore-certificate-errors")));
});

test("Paths: URL allowlist strictly guards platforms and rejects lookalikes", () => {
  // Xiaohongshu
  assert.ok(validatePlatformUrl("https://www.xiaohongshu.com/explore", "xiaohongshu"));
  assert.ok(validatePlatformUrl("https://xiaohongshu.com/discovery/item/123", "xiaohongshu"));
  assert.ok(validatePlatformUrl("https://xhslink.com/a/b/c", "xiaohongshu"));
  assert.ok(!validatePlatformUrl("https://evilxiaohongshu.com/explore", "xiaohongshu"));
  assert.ok(!validatePlatformUrl("https://xiaohongshu.evil.com/explore", "xiaohongshu"));
  assert.ok(!validatePlatformUrl("https://google.com", "xiaohongshu"));

  // X / Twitter
  assert.ok(validatePlatformUrl("https://x.com/home", "x"));
  assert.ok(validatePlatformUrl("https://twitter.com/search", "x"));
  assert.ok(!validatePlatformUrl("https://evilx.com", "x"));
  assert.ok(!validatePlatformUrl("https://x.com.evil.com", "x"));
  assert.ok(!validatePlatformUrl("https://evil-twitter.com", "x"));
});
