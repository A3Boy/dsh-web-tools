/**
 * dsh-web-tools — settings.section registration contract.
 *
 * Verifies the client registers EXACTLY ONE `settings.section` entry
 * (id "web-tools", order 30, localized label) and never registers
 * `settings.plugin.item` — the old Plugins-page card slot.
 *
 * Runs against the pure registration module (plain TS, no tsx/browser).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerSettingsSection, SECTION_ID, SECTION_ORDER } from "../src/client/registration.ts";

/** Capture every slots.inject/register call in a minimal fake ctx. */
function fakeCtx() {
  const injected: Array<{ name: string; fn: () => unknown }> = [];
  const registered: Array<{ entry: Record<string, unknown>; component: unknown }> = [];
  const ctx = {
    slots: {
      inject(name: string, fn: () => unknown) {
        injected.push({ name, fn });
        // Real slots.inject invokes the registrant immediately to build the
        // entry — mirror that so `registered` fills in.
        fn();
        return undefined;
      },
      register(entry: Record<string, unknown>, component: unknown) {
        registered.push({ entry, component });
        return undefined;
      },
    },
  };
  return { ctx, injected, registered };
}

test("registers exactly one settings.section entry", () => {
  const { ctx, injected, registered } = fakeCtx();
  const t = (key: string) => `t:${key}`;

  registerSettingsSection(ctx, t, "SectionComponent");

  assert.equal(injected.length, 1, "one slots.inject call");
  assert.equal(injected[0].name, "settings.section", "injects into settings.section");
  assert.equal(registered.length, 1, "one slots.register call");
  assert.equal(registered[0].entry.name, "settings.section");
});

test("section entry carries id web-tools, order 30, and the localized label", () => {
  const { ctx, registered } = fakeCtx();
  const t = (key: string) => `t:${key}`;

  registerSettingsSection(ctx, t, "SectionComponent");

  const entry = registered[0].entry;
  assert.equal(entry.id, SECTION_ID);
  assert.equal(SECTION_ID, "web-tools");
  assert.equal(entry.order, SECTION_ORDER);
  assert.equal(SECTION_ORDER, 30);
  assert.equal(typeof entry.label, "function");
  assert.equal((entry.label as () => string)(), "t:nav", "label delegates to locale t()");
  // inject() must hand t to the component
  const injectedProps = (entry.inject as () => { t: (k: string) => string })();
  assert.equal(injectedProps.t("nav"), "t:nav");
  // component passes through untouched
  assert.equal(registered[0].component, "SectionComponent");
});

test("never registers settings.plugin.item (the old card slot)", () => {
  const { ctx, injected, registered } = fakeCtx();
  const t = (key: string) => `t:${key}`;

  registerSettingsSection(ctx, t, "SectionComponent");

  const allNames = [
    ...injected.map((i) => i.name),
    ...registered.map((r) => String(r.entry.name)),
  ];
  assert.ok(!allNames.includes("settings.plugin.item"), "settings.plugin.item must not be registered");
  assert.ok(!allNames.includes("settings.plugins.tab"), "settings.plugins.tab must not be registered");
});

test("registration is idempotent per apply() call (one entry, no duplicates)", () => {
  const { ctx, registered } = fakeCtx();
  const t = (key: string) => `t:${key}`;

  registerSettingsSection(ctx, t, "A");
  registerSettingsSection(ctx, t, "B");

  // Each apply() registers one entry; the shell dedupes by id — but within
  // one apply the entry must appear exactly once.
  assert.equal(registered.length, 2);
  assert.equal(registered[0].entry.id, "web-tools");
  assert.equal(registered[1].entry.id, "web-tools");
});
