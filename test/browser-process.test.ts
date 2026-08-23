import assert from "node:assert/strict";
import test from "node:test";
import { buildSafeLaunchArgs } from "../src/host/browser/process-manager.ts";
import { validatePlatformUrl } from "../src/host/browser/paths.ts";

test("ProcessManager: safe args enforce security invariants, start-minimized and headless", () => {
  const argsMinimized = buildSafeLaunchArgs("C:\\profiles\\xhs", 9222, "https://www.xiaohongshu.com/explore", true, false);
  assert.ok(argsMinimized.includes("--start-minimized"));
  assert.ok(!argsMinimized.includes("--headless=new"));

  const argsHeadless = buildSafeLaunchArgs("C:\\profiles\\xhs", 9222, undefined, false, true);
  assert.ok(argsHeadless.includes("--headless=new"));
  assert.ok(!argsHeadless.includes("--start-minimized"));

  // Check forbidden dangerous flags
  for (const args of [argsMinimized, argsHeadless]) {
    assert.ok(args.includes("--user-data-dir=C:\\profiles\\xhs"));
    assert.ok(args.includes("--remote-debugging-address=127.0.0.1"));
    assert.ok(args.includes("--remote-debugging-port=9222"));
    assert.ok(!args.some((a) => a.includes("--disable-web-security")));
    assert.ok(!args.some((a) => a.includes("--no-sandbox")));
    assert.ok(!args.some((a) => a.includes("--remote-allow-origins=*")));
    assert.ok(!args.some((a) => a.includes("--ignore-certificate-errors")));
  }
});

test("Paths: URL allowlist strictly guards platforms, rejects http/ftp and lookalikes", () => {
  // Xiaohongshu
  assert.ok(validatePlatformUrl("https://www.xiaohongshu.com/explore", "xiaohongshu"));
  assert.ok(validatePlatformUrl("https://xiaohongshu.com/discovery/item/123", "xiaohongshu"));
  assert.ok(validatePlatformUrl("https://xhslink.com/a/b/c", "xiaohongshu"));
  assert.ok(!validatePlatformUrl("http://www.xiaohongshu.com/explore", "xiaohongshu")); // http disallowed
  assert.ok(!validatePlatformUrl("ftp://www.xiaohongshu.com/explore", "xiaohongshu"));
  assert.ok(!validatePlatformUrl("https://evilxiaohongshu.com/explore", "xiaohongshu"));
  assert.ok(!validatePlatformUrl("https://xiaohongshu.evil.com/explore", "xiaohongshu"));
  assert.ok(!validatePlatformUrl("https://google.com", "xiaohongshu"));

  // X / Twitter
  assert.ok(validatePlatformUrl("https://x.com/home", "x"));
  assert.ok(validatePlatformUrl("https://twitter.com/search", "x"));
  assert.ok(!validatePlatformUrl("http://x.com/home", "x")); // http disallowed
  assert.ok(!validatePlatformUrl("https://evilx.com", "x"));
  assert.ok(!validatePlatformUrl("https://x.com.evil.com", "x"));
  assert.ok(!validatePlatformUrl("https://evil-twitter.com", "x"));
});
