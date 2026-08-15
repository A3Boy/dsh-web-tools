# Contributing to dsh-web-tools

Thanks for your interest in contributing! This project aims to be a
high-quality, community-driven DSH web search hub. All contributions are
welcome — bug reports, feature requests, docs, and new providers.

## Development setup

The plugin is a TypeScript ESM package. To type-check against the real DSH
types, either install the peer dependencies or create a junction to your DSH
profile's `node_modules`:

```bash
# type-check (Host)
npx tsc -p tsconfig.json --noEmit
# type-check (Client)
npx tsc -p tsconfig.client.json --noEmit
# build to lib/
npx tsc -p tsconfig.build.json
# full test suite (unit + route smoke + runtime invariants)
npm test
# route smoke only
npm run smoke
```

## Adding a new provider

1. Create `src/host/providers/<name>.ts` implementing the `ProviderAdapter`
   contract (`src/host/providers/types.ts`): `search()`, optional `fetch()`,
   plus `META` (name/label/description/credSuffix/fetchCapable/needsBaseUrl).
2. If the backend has a quota API, add a `<name>-quota.ts` (or a function in
   the same file) returning a `QuotaSnapshot` — mark it `authoritative: true`
   only when it is an official API; otherwise use `best_effort_api` /
   `local_estimate` / `dashboard` and never let quota failure break search.
3. Register it in `src/host/providers/index.ts` (`PROVIDERS` map + `PROVIDER_LIST`).
4. Classify HTTP failures through the shared `classifyHttpStatus()` /
   `throwIfHttp(label, res)` helpers (in `types.ts`) — never hand-roll a
   per-adapter mapping. The `ProviderErrorCode` union is closed:
   `auth | quota | bad-request | rate-limit | timeout | server | network |
   config | aborted | invalid-response`.
5. Add a real-search verification (like the ones documented in the README) and
   unit tests for any parsing logic.

## Conventions

- **Model tool surface stays `web_search` / `web_fetch`** — never expose
  per-provider tools.
- **Credentials never reach the browser** — the UI only sees configured /
  writable state; values live in `ctx.credentials`.
- **Quota is a side-channel** — a quota failure must never fail a search.
- Follow the structural-mirror pattern (`src/host/context-types.ts`) for DSH
  services — do not import DSH internals.

## Commit & PR

- Keep commits focused and messages imperative ("Add X", "Fix Y").
- Run the unit tests + smoke test before opening a PR.
- Update the README provider table if you add a provider.

## License

By contributing you agree your contributions are licensed under the MIT
License (see [LICENSE](LICENSE)).
