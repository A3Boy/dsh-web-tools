/**
 * dsh-web-tools — Client UI primitives icon compatibility tests (Issue #7).
 *
 * Verifies that:
 * 1. DSH 0.1.7+ renamed 10 icons from size-suffixed names to stroke-suffixed (*Regular).
 * 2. patchPrimitivesIcons aliases all 10 icons on the primitives object.
 * 3. Default nominal sizes (14 for 14-suffixed icons, 16 for 16-suffixed icons) are applied.
 * 4. Caller props (custom size, className, etc.) override defaults and pass through.
 * 5. Pre-0.1.7 primitives (where old icon names exist) are never overwritten.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { patchPrimitivesIcons, ICON_ALIASES } from "../src/client/compat-icons.ts";

test("ICON_ALIASES covers all 10 renamed icons from Issue #7", () => {
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
    const found = ICON_ALIASES.find(([oldName]) => oldName === name);
    assert.ok(found, `Must include ${name}`);
    const regName = name.replace(/1[46]$/, "Regular");
    assert.equal(found[1], regName);
    const nominalSize = Number(name.slice(-2));
    assert.equal(found[2], nominalSize);
  }
});

test("patchPrimitivesIcons: installs compatibility components when old names are missing", () => {
  const renderedCalls: Record<string, any[]> = {};

  const fakePrimitives: Record<string, any> = {
    Button: () => null,
  };

  // Populate only the modern 0.1.7 Regular icons
  for (const [_, newName] of ICON_ALIASES) {
    fakePrimitives[newName] = (props: any) => {
      renderedCalls[newName] = renderedCalls[newName] || [];
      renderedCalls[newName].push(props);
      return React.createElement("svg", props);
    };
  }

  // Before patch: old icons are undefined
  for (const [oldName] of ICON_ALIASES) {
    assert.equal(fakePrimitives[oldName], undefined);
  }

  // Apply patch
  patchPrimitivesIcons(fakePrimitives);

  // After patch: all 10 old icons are defined functions
  for (const [oldName, newName, nominalSize] of ICON_ALIASES) {
    assert.equal(typeof fakePrimitives[oldName], "function", `${oldName} should be a function`);

    // Render with default size
    const defaultEl = fakePrimitives[oldName]({});
    assert.equal(defaultEl.type, fakePrimitives[newName]);
    assert.equal(defaultEl.props.size, nominalSize);

    // Render with overridden props
    const customEl = fakePrimitives[oldName]({ size: 13, className: "custom-icon" });
    assert.equal(customEl.props.size, 13);
    assert.equal(customEl.props.className, "custom-icon");
  }
});

test("patchPrimitivesIcons: does NOT overwrite existing legacy icon exports", () => {
  const legacyIcon = () => "legacy-14";
  const fakePrimitives: Record<string, any> = {
    IconChevronDownOutline14: legacyIcon,
    IconChevronDownOutlineRegular: () => "regular",
  };

  patchPrimitivesIcons(fakePrimitives);
  assert.equal(fakePrimitives.IconChevronDownOutline14, legacyIcon, "must not overwrite existing old icon");
});

test("built lib/client.js: executes in DSH 0.1.7 environment and patches primitives seamlessly", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const vm = await import("node:vm");

  const clientJsPath = join(process.cwd(), "lib", "client.js");
  const code = readFileSync(clientJsPath, "utf8");

  const mockPrimitives: Record<string, any> = {
    Button: (props: any) => React.createElement("button", props),
    Input: (props: any) => React.createElement("input", props),
    Modal: (props: any) => React.createElement("div", props),
    Menu: (props: any) => React.createElement("div", props),
    StateDot: (props: any) => React.createElement("span", props),
  };

  // Modern DSH 0.1.7: only Regular icons are present
  for (const [_, newName] of ICON_ALIASES) {
    mockPrimitives[newName] = (props: any) => React.createElement("svg", props);
  }

  let loadedModule: any = null;
  const mockWindow: any = {
    document: {
      head: {
        appendChild: () => {},
      },
      getElementById: () => null,
      createElement: () => ({ setAttribute: () => {}, textContent: "" }),
    },
    __ModuleLoader__: {
      load: ({ id, factory }: { id: string; factory: (req: any) => any }) => {
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

  // Verify that all 10 old icons are now present on mockPrimitives
  for (const [oldName] of ICON_ALIASES) {
    assert.equal(typeof mockPrimitives[oldName], "function", `${oldName} must be defined on primitives`);
  }
});
