import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CURRENT_VERSION, compareVersions } from "../src/shared/version.ts";

test("version comparison accepts v-prefixed semantic versions", () => {
  assert.equal(compareVersions("v0.2.1", "0.2.0"), 1);
  assert.equal(compareVersions("0.2.0", "v0.2.0"), 0);
  assert.equal(compareVersions("0.1.9", "0.2.0"), -1);
  assert.equal(compareVersions("1.0.0", "0.9.99"), 1);
});

test("shipped version stays in sync with package.json", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(CURRENT_VERSION, pkg.version);
});
