/**
 * dsh-web-tools — tsdown build for the browser client bundle.
 *
 * DSH's web shell loads third-party client plugins as SINGLE script bundles
 * served from /plugins/<package-name>/client.js and registered through the
 * shared module loader (`window.__ModuleLoader__.load({ id, factory })`).
 * This config replicates the official DSH client-bundle preset
 * (packages/client/tsdown.client.ts in deepseek-harness, same shape as
 * dsh-better-sidebar):
 *
 * - the host half stays on plain `tsc` (see tsconfig.build.json) — Node ESM;
 * - the client half is bundled here as one CJS-closure script whose `require`
 *   resolves only the platform module table (react, cordis, the injected
 *   @deepseek-ai client services); everything else is inlined;
 * - the purity gate rejects any @deepseek-ai value import that is not a
 *   platform module or an inline-safe wire layer: cross-plugin collaboration
 *   goes through cordis services, never value imports;
 * - the bundle registers itself via window.__ModuleLoader__.load with the
 *   package-name id (`dsh-web-tools`; client-modules compose keys on the
 *   package name — keep it in sync with package.json `name`).
 *
 * Types ship from `tsc -p tsconfig.build.json` (lib/*.d.ts), not from tsdown.
 */
import { builtinModules } from 'node:module'
import type { UserConfig } from 'tsdown'

/** Node builtins must never survive into the browser module-loader factory. */
const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map(id => `node:${id}`),
])

/** Module specifiers the web shell shares into the frozen module table (the official PLATFORM_MODULES list, plus the runtime/client exemption). */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

/** Wire/type layers a client bundle may inline (mirror of the official INLINE_SAFE list). */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

/** A rolldown plugin as tsdown's config accepts it (contextual `this` for load/resolveId). */
type BuildPlugin = NonNullable<UserConfig['plugins']>

/** The official client-bundle purity gate: only platform modules + inline-safe wire layers may be imported from @deepseek-ai/*. */
function purityGatePlugin(): BuildPlugin {
  return {
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (NODE_BUILTINS.has(source)) {
        throw new Error(
          `client bundle purity: Node builtin "${source}" cannot run in the browser module table — `
          + 'select the dependency browser export or add an explicit browser implementation',
        )
      }
      if (!source.startsWith('@deepseek-ai/')) return null
      if (CLIENT_EXTERNALS.includes(source)) return null // platform module: external wins
      if (INLINE_SAFE.test(source)) return null // wire/type layer: inline is the point
      throw new Error(
        `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS) and not an inline-safe wire layer — `
        + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased and never reach this gate)',
      )
    },
  }
}

export default [
  // Official profile channel: bundle id = package name (package.json `name`).
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    // clean stays off: the build script removes lib/ wholesale before tsc, so
    // a tsdown clean here would wipe the lib types tsc just emitted.
    clean: false,
    // Platform module-table entries stay external (resolved by the loader's
    // `require` at runtime); every other dependency is inlined into the bundle.
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) => (CLIENT_EXTERNALS.includes(id) ? false : true),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
      'import.meta.resolve': 'undefined',
    },
    // CJS output otherwise makes some transitive packages resolve their Node
    // entry even though this bundle runs in the browser. Keep browser
    // conditional exports authoritative for both source import() and
    // generated require() edges.
    inputOptions: {
      resolve: {
        conditionNames: ['browser', 'import', 'require', 'default'],
      },
    },
    plugins: [purityGatePlugin()],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: "dsh-web-tools", factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      // The CJS wrapper factory's `require` only resolves module-table entries
      // (react, cordis, ...); it cannot load relative chunk URLs in the
      // browser. Disable code splitting so the artifact is one script.
      codeSplitting: false,
    },
  },
] satisfies UserConfig[]
