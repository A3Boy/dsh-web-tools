/**
 * dsh-web-tools — client manifest contract.
 *
 * `dsh.client.inject` lists the CLIENT PLUGIN packages this bundle wants loaded
 * (or prefetched) before it runs. Per the official convention every entry names
 * a package that actually IS a client plugin — it declares a `dsh.client`
 * manifest and exports `./client` (e.g. dsh-client-connection, dsh-client-locale,
 * dsh-client-ui-settings, dsh-api-remotes).
 *
 * It must NOT list:
 *  - shared libraries that merely provide a module or a service (they have no
 *    `dsh.client` declaration and no `./client` export, so the edge can never
 *    resolve) — `@deepseek-ai/dsh-client-ui-slots` and
 *    `@deepseek-ai/dsh-client-ui-primitives` are both in this class, and the
 *    services they back (`slots`) are already waited on through the Cordis
 *    `inject` export instead, and
 *  - abandoned packages — `@deepseek-ai/dsh-client-runtime` was last published
 *    at 0.1.1-rc.2, is absent from the installed runtime, and has no 0.2.x
 *    release at all.
 *
 * DSH documents these edges as loading/prefetch metadata rather than apply
 * sequencing, so a stale entry is inert today — but it is an unresolvable edge,
 * and it would stall this bundle outright if the client loader ever turned
 * those edges into a wait.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const readPkg = () =>
  JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
    dsh?: { client?: { platform?: string; inject?: unknown } };
    peerDependencies?: Record<string, string>;
  };

/** Packages that are not client plugins and must never appear as inject edges. */
const NOT_CLIENT_PLUGINS = [
  "@deepseek-ai/dsh-client-runtime", // abandoned: last published 0.1.1-rc.2, no 0.2.x
  "@deepseek-ai/dsh-client-ui-slots", // shared library: no ./client export, no dsh.client
  "@deepseek-ai/dsh-client-ui-primitives", // shared library: same
];

/**
 * Packages the shipped bundle must not reference at all. `dsh-client-ui-primitives`
 * is deliberately absent: it is a platform module the bundle legitimately
 * requires, which is exactly why it is a peer rather than an inject edge.
 */
const MUST_NOT_APPEAR_IN_BUNDLE = [
  "@deepseek-ai/dsh-client-runtime",
  "@deepseek-ai/dsh-client-ui-slots",
];

test("dsh.client declares the web platform and a well-formed inject list", () => {
  const pkg = readPkg();
  const client = pkg.dsh?.client;
  assert.ok(client, "package.json must declare dsh.client");
  assert.equal(client!.platform, "web", "client platform must stay web");

  const inject = client!.inject;
  assert.ok(Array.isArray(inject) && inject.length > 0, "inject must be a non-empty array");
  for (const entry of inject as unknown[]) {
    assert.equal(typeof entry, "string", "every inject entry must be a string");
    assert.ok((entry as string).startsWith("@deepseek-ai/"), `inject entry "${String(entry)}" must be a scoped DSH package`);
  }
  assert.equal(new Set(inject as string[]).size, (inject as string[]).length, "inject entries must be unique");
});

test("inject never names a package that is not a client plugin", () => {
  const inject = readPkg().dsh!.client!.inject as string[];
  for (const dead of NOT_CLIENT_PLUGINS) {
    assert.ok(
      !inject.includes(dead),
      `${dead} is not a client plugin (no dsh.client declaration / no ./client export) and must not be an inject edge`,
    );
  }
});

test("abandoned packages are not declared as peers either", () => {
  const peers = readPkg().peerDependencies ?? {};
  assert.ok(
    !Object.hasOwn(peers, "@deepseek-ai/dsh-client-runtime"),
    "dsh-client-runtime was last published at 0.1.1-rc.2 and has no 0.2.x release; it must not be a declared peer",
  );
});

test("every injected package is also covered by a declared peer range", () => {
  const pkg = readPkg();
  const inject = pkg.dsh!.client!.inject as string[];
  const peers = pkg.peerDependencies ?? {};
  for (const name of inject) {
    assert.ok(
      Object.hasOwn(peers, name),
      `injected package ${name} must also appear in peerDependencies so its compatible range is declared`,
    );
    assert.match(
      peers[name],
      /\^0\.1\.0-rc\.6 \|\| \^0\.2\.0-0/,
      `${name} peer range must keep covering the 0.1 and 0.2 lines`,
    );
  }
});

test("the emitted client bundle never requires an inject-only or abandoned module", () => {
  const bundle = readFileSync(join(here, "..", "lib", "client.js"), "utf8");
  const requires = [...bundle.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
  const unique = [...new Set(requires)].sort();

  // The only externals the emitted bundle may pull from the platform module
  // table: react and the UI primitives (a platform module, deliberately NOT an
  // inject edge). Anything else means a new value import slipped in.
  assert.deepEqual(
    unique,
    ["@deepseek-ai/dsh-client-ui-primitives", "react", "react/jsx-runtime"],
    "unexpected require() target in the client bundle",
  );
  for (const dead of MUST_NOT_APPEAR_IN_BUNDLE) {
    assert.ok(!bundle.includes(dead), `bundle must not reference ${dead}`);
  }
});
