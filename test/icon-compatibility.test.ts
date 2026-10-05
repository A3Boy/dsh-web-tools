/**
 * dsh-web-tools — UI primitives icon compatibility (Issue #7).
 *
 * DSH 0.1.7 renamed the 10 product icons this card uses from size-suffixed
 * exports (`IconSearchOutline16`) to stroke-suffixed artwork (`…Regular`).
 *
 * The FIRST attempt at this fix patched the old names onto the primitives
 * namespace. That cannot work, and the tests below pin why: the web shell seeds
 * its module table with the namespace it already froze
 * (`Object.freeze(Object.defineProperty({…}, Symbol.toStringTag, …))`) and the
 * loader stores that reference verbatim
 * (`new Map(Object.entries(options.staticModules))`), so the assignment is a
 * silent no-op in a non-strict bundle — the icons stayed `undefined` and React
 * rejected them (error #130). `resolveIcon` therefore RESOLVES the old names
 * against the live module instead of writing to it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { ICON_ALIASES, NULL_ICON, resolveIcon, type IconAliasSpec } from "../src/client/compat-icons.ts";

test("ICON_ALIASES maps all 10 renamed icons to their stroke-suffixed artwork", () => {
  const expectedOldNames = [
    "IconChevronDownOutline14",
    "IconChevronRightOutline14",
    "IconGlobeOutline14",
    "IconCloseOutline16",
    "IconEditOutline16",
    "IconPlusOutline16",
    "IconRefreshOutline16",
    "IconSearchOutline16",
    "IconSettingsOutline16",
    "IconTrashOutline16",
  ];

  assert.equal(ICON_ALIASES.length, 10);
  for (const name of expectedOldNames) {
    const found = ICON_ALIASES.find(([legacy]) => legacy === name);
    assert.ok(found, `must include ${name}`);
    assert.equal(found![1], name.replace(/1[46]$/, "Regular"), `${name} artwork target`);
    assert.equal(found![2], Number(name.slice(-2)), `${name} nominal size`);
  }
});

test("a frozen namespace without legacy names still resolves every icon", () => {
  // Exactly what the shell hands out on 0.1.7+: the namespace is frozen and the
  // size-suffixed names are gone, so nothing may rely on writing to it.
  const artwork: Record<string, unknown> = { Button: () => null };
  for (const [, artworkName] of ICON_ALIASES) {
    artwork[artworkName] = (props: Record<string, unknown>) => React.createElement("svg", props);
  }
  const frozen = Object.freeze(artwork);
  assert.equal(Object.isFrozen(frozen), true, "precondition: the shell namespace is frozen");

  for (const spec of ICON_ALIASES) {
    const [legacyName] = spec;
    assert.equal(frozen[legacyName as keyof typeof frozen], undefined, `${legacyName} is absent on 0.1.7+`);

    const Icon = resolveIcon(frozen as Record<string, unknown>, spec);
    assert.notEqual(Icon, NULL_ICON, `${legacyName} must resolve, not fall back`);
    assert.equal(typeof Icon, "function");

    // The nominal size is applied, and caller props win over it.
    const el = (Icon as any)({}) as React.ReactElement<any>;
    assert.equal(el.props.size, spec[2], `${legacyName} nominal size`);
    const custom = (Icon as any)({ size: 13, className: "x" }) as React.ReactElement<any>;
    assert.equal(custom.props.size, 13);
    assert.equal(custom.props.className, "x");
  }
});

test("resolution prefers a host that still publishes the legacy name", () => {
  const legacy = () => React.createElement("svg", { "data-legacy": "1" });
  const modern = () => React.createElement("svg", { "data-modern": "1" });
  const host = { IconChevronDownOutline14: legacy, IconChevronDownOutlineRegular: modern };
  const spec: IconAliasSpec = ["IconChevronDownOutline14", "IconChevronDownOutlineRegular", 14];

  assert.equal(resolveIcon(host, spec), legacy, "pre-0.1.7 hosts keep their own component (and its size)");
});

test("an unknown future rename degrades to a null renderer, never to undefined", () => {
  // Undefined is what makes React throw #130 and take the whole card down; a
  // null renderer costs one missing glyph instead.
  const spec: IconAliasSpec = ["IconChevronDownOutline14", "IconChevronDownOutlineRegular", 14];
  assert.equal(resolveIcon({}, spec), NULL_ICON, "no artwork at all");
  assert.equal(resolveIcon(undefined, spec), NULL_ICON, "no module at all");
  const el = (NULL_ICON as any)({}) as React.ReactElement<any> | null;
  assert.equal(el, null, "the fallback renders nothing");
});

test("built lib/client.js resolves icons from a frozen 0.1.7-shaped namespace", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const vm = await import("node:vm");

  const code = readFileSync(join(process.cwd(), "lib", "client.js"), "utf8");

  // Mirror the real shell: frozen namespace, stroke-suffixed artwork only.
  const artwork: Record<string, unknown> = {
    Button: (props: any) => React.createElement("button", props),
    Input: (props: any) => React.createElement("input", props),
    Modal: (props: any) => React.createElement("div", props),
    Menu: (props: any) => React.createElement("div", props),
    StateDot: (props: any) => React.createElement("span", props),
  };
  for (const [, artworkName] of ICON_ALIASES) {
    artwork[artworkName] = (props: any) => React.createElement("svg", props);
  }
  const mockPrimitives = Object.freeze(artwork);

  let loadedModule: any = null;
  const mockWindow: any = {
    document: {
      head: { appendChild: () => {} },
      getElementById: () => null,
      createElement: () => ({ setAttribute: () => {}, textContent: "" }),
    },
    __ModuleLoader__: {
      load: ({ factory }: { id: string; factory: (req: any) => any }) => {
        const mockRequire = (modName: string) => {
          if (modName === "react") return React;
          if (modName === "react/jsx-runtime") return { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment };
          if (modName === "@deepseek-ai/dsh-client-ui-primitives") return mockPrimitives;
          return {};
        };
        loadedModule = factory(mockRequire);
      },
    },
  };

  const context = vm.createContext({
    window: mockWindow,
    document: mockWindow.document,
    console,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(code, context);

  assert.ok(loadedModule, "lib/client.js factory must execute and return exports");
  assert.equal(typeof loadedModule.apply, "function", "apply must be exported");

  // The emitted bundle must never READ a size-suffixed name off the platform
  // namespace: that read yields undefined on 0.1.7+ and is what React rejects.
  // The legacy names may only survive as string literals in the alias table.
  for (const [legacyName] of ICON_ALIASES) {
    assert.ok(
      !code.includes(`.${legacyName}`),
      `bundle must not read ${legacyName} as a member of the primitives namespace`,
    );
  }
  // …while the artwork names it resolves through must be referenced.
  for (const [, artworkName] of ICON_ALIASES) {
    assert.ok(code.includes(artworkName), `bundle must reference the artwork name ${artworkName}`);
  }
});
