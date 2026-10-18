/**
 * Guards the inlined Lucide geometry against silent edits.
 *
 * The icons are hand-copied from lucide-static (ISC) rather than pulled from
 * `lucide-react`, so nothing at build time would notice a dropped path or a
 * re-typed coordinate. This test reads the source as text — the module is JSX,
 * which the node test runner cannot strip — and asserts the exact upstream `d`
 * values plus the shared frame defaults.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../src/client/lucide-icons.tsx", import.meta.url), "utf8");

/** Exact `d` values from lucide-static v1.59.0, in source order per icon. */
const EXPECTED_PATHS: Record<string, string[]> = {
  Globe: [
    "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",
    "M2 12h20",
  ],
  WifiOff: [
    "M12 20h.01",
    "M8.5 16.429a5 5 0 0 1 7 0",
    "M5 12.859a10 10 0 0 1 5.17-2.69",
    "M19 12.859a10 10 0 0 0-2.007-1.523",
    "M2 8.82a15 15 0 0 1 4.177-2.643",
    "M22 8.82a15 15 0 0 0-11.288-3.764",
    "m2 2 20 20",
  ],
  RadioTower: [
    "M4.9 16.1C1 12.2 1 5.8 4.9 1.9",
    "M7.8 4.7a6.14 6.14 0 0 0-.8 7.5",
    "M16.2 4.8c2 2 2.26 5.11.8 7.47",
    "M19.1 1.9a9.96 9.96 0 0 1 0 14.1",
    "M9.5 18h5",
    "m8 22 4-11 4 11",
  ],
  ChevronDown: ["m6 9 6 6 6-6"],
  Check: ["M20 6 9 17l-5-5"],
};

/** Isolate one exported component's JSX block. */
function blockOf(component: string): string {
  const start = SOURCE.indexOf(`export function ${component}Icon(`);
  assert.ok(start >= 0, `export function ${component}Icon must exist`);
  const next = SOURCE.indexOf("\nexport function ", start + 1);
  return SOURCE.slice(start, next < 0 ? undefined : next);
}

test("inlined icons keep the exact upstream Lucide geometry", () => {
  for (const [component, paths] of Object.entries(EXPECTED_PATHS)) {
    const block = blockOf(component);
    const found = [...block.matchAll(/<path\s+d="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(found, paths, `${component} path geometry drifted from lucide-static`);
  }
});

test("globe keeps its circle primitive", () => {
  const block = blockOf("Globe");
  assert.match(block, /<circle cx="12" cy="12" r="10" \/>/);
});

test("the shared frame keeps the product defaults and inherits colour", () => {
  // 24-unit viewBox, 16px default size, 1.8 default stroke, currentColor.
  assert.match(SOURCE, /viewBox="0 0 24 24"/);
  assert.match(SOURCE, /const size = props\.size \?\? 16;/);
  assert.match(SOURCE, /const strokeWidth = props\.strokeWidth \?\? 1\.8;/);
  assert.match(SOURCE, /stroke="currentColor"/);
  assert.match(SOURCE, /fill="none"/);
  assert.match(SOURCE, /strokeLinecap="round"/);
  assert.match(SOURCE, /strokeLinejoin="round"/);
});

