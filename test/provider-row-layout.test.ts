/**
 * dsh-web-tools — provider-row layout contract (regression guard).
 *
 * Bug history (fixed here): the settings card injects responsive CSS for
 * `.wt-provider-row` / `.wt-provider-meta`, but `ProviderRow` never applied
 * those class names and `SettingsRow` had no way to carry them. The rules were
 * dead code, so a narrow settings pane left the provider row unable to wrap;
 * the rigid 220px status block pushed the "加入搜索顺序" (add-to-chain) button
 * past the card edge, and `.dswt-group-card { overflow: hidden }` clipped it.
 * Users clicking where the control should be hit the non-interactive
 * "未加入搜索顺序" label instead, so the click produced no request at all.
 *
 * These assertions are static (no DOM available in this repo: the
 * `@deepseek-ai/dsh-client-ui-primitives` peer is not installed, so the
 * component cannot be imported here). They lock the wiring that must exist for
 * the injected selectors to bind.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, "..", rel), "utf8");

/** Selectors the provider row relies on, and where they must be applied. */
const REQUIRED_ROW_CLASSES = ["wt-provider-row", "wt-provider-meta"];

test("injected provider-row CSS selectors are actually applied by the row", () => {
  const section = read("src/client/WebToolsSection.tsx");

  // The injected stylesheet must still declare each selector.
  for (const cls of REQUIRED_ROW_CLASSES) {
    assert.ok(
      section.includes(`.${cls}`),
      `WebToolsSection must still declare the .${cls} rule`,
    );
  }

  // ...and the row must actually carry them, otherwise the rules are dead and
  // the action buttons can be clipped by the card's overflow:hidden.
  assert.match(
    section,
    /className="wt-provider-row"/,
    "ProviderRow must pass className=\"wt-provider-row\" so the wrap rule binds",
  );
  assert.match(
    section,
    /trailingClassName="wt-provider-meta"/,
    "ProviderRow must pass trailingClassName=\"wt-provider-meta\" so the trailing slot can shrink/wrap",
  );
});

test("SettingsRow forwards className and trailingClassName onto real elements", () => {
  const group = read("src/client/ui/SettingsGroup.tsx");

  // Props must be declared...
  assert.match(group, /className\?: string;/, "SettingsRow must accept className");
  assert.match(group, /trailingClassName\?: string;/, "SettingsRow must accept trailingClassName");

  // ...destructured...
  assert.match(group, /const \{[^}]*className[^}]*\} = props;/s, "SettingsRow must destructure className");

  // ...and applied to both the row element and the trailing wrapper. Without
  // the trailing wiring the responsive shrink/wrap hooks never reach the slot
  // that holds the add/remove chain buttons.
  const trailingApplies = /dswt-row-trailing \$\{trailingClassName\}/.test(group);
  assert.ok(trailingApplies, "trailing wrapper must compose dswt-row-trailing with trailingClassName");

  const rowApplies = /dswt-settings-row[^"]*\$\{className\}/.test(group);
  assert.ok(rowApplies, "row element must compose dswt-settings-row with className");
});

test("trailing slot is shrinkable while its action buttons stay rigid", () => {
  const styles = read("src/client/ui/styles.ts");

  const trailing = /\.dswt-row-trailing\s*\{[^}]*\}/s.exec(styles);
  assert.ok(trailing, ".dswt-row-trailing rule must exist");
  assert.match(
    trailing![0],
    /flex:\s*0 1 auto/,
    "trailing slot must be shrinkable (flex: 0 1 auto) so it cannot overflow the clipping card",
  );
  assert.match(trailing![0], /min-width:\s*0/, "trailing slot must allow shrinking below content width");

  assert.match(
    styles,
    /\.dswt-row-trailing > button\s*\{[^}]*flex:\s*none/s,
    "action buttons inside the trailing slot must stay rigid so they never collapse",
  );
});

test("add-to-chain control does not depend on receiving the DOM event", () => {
  const section = read("src/client/WebToolsSection.tsx");

  // The add button must invoke the handler without reaching into the event
  // object: a primitive that ever wraps the handler would otherwise make the
  // click a silent no-op.
  const addButton = /onAdd\?\.\(\)/.test(section);
  assert.ok(addButton, "add-to-chain handler must be invoked without the event argument");
  assert.ok(
    !/onClick=\{\(e\)\s*=>\s*\{\s*e\.stopPropagation\(\);\s*onAdd/.test(section),
    "add-to-chain must not require e.stopPropagation() before onAdd()",
  );
});
