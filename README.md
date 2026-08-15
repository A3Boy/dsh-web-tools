<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="180" />
</p>

# dsh-web-tools

**Configurable multi-search-source backends for DeepSeek Harness's
`web_search` / `web_fetch`.**

Configure Tavily, Exa, Firecrawl, Brave, You.com, Jina, or SearXNG — when one
source is rate-limited, exhausted, or down, the plugin switches to the next in
your configured order. The agent keeps using DSH's original `web_search` /
`web_fetch`; no new tools are added.

**BYOK** · API keys live in DSH Credentials and requests go directly to each
provider — no intermediary server.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

**English** | [简体中文](README.zh-CN.md)

</div>

<!-- Main settings screenshot (Settings → Plugins → Plugin configuration → dsh-web-tools) -->
<!-- ![dsh-web-tools Settings](assets/settings.png) -->

> 7 Providers · Native DSH tools · Fallback · BYOK · SearXNG

---

## Why

* **7 search providers**: Tavily, Exa, Firecrawl, Brave, You.com, Jina, SearXNG
* **Native DSH tools only**: the model sees just `web_search` / `web_fetch` —
  no `tavily_search`-style provider tools
* **Custom priority**: default provider + ordered fallback chain
* **Multi-key + health + quota**: credential pools, provider health, quota state
* **Native DSH settings page**: providers, credentials, connection tests, and
  test search in one place

## Quick Start

### Requirements

* DeepSeek Harness: developed and tested against `0.1.0-rc.6`
* Uses the DSH `web` profile
* Installing external bundles requires `pnpm`
* Commercial providers use your own API keys; SearXNG works with no commercial
  API key

### Install

```bash
dsh plugin --profile web add github:A3Boy/dsh-web-tools
```

Restart `dsh web`, then open the plugin settings page to configure providers.
The plugin integrates through DSH's official **Profile Bundle** mechanism —
no Harness core changes.

```bash
# check the composed config
dsh --profile web --dump-config

# update / remove
dsh plugin --profile web update dsh-web-tools
dsh plugin --profile web remove dsh-web-tools
```

### Configure providers

1. `Settings → Plugins → Plugin configuration → dsh-web-tools`
2. Fill in API keys per provider (comma-separated keys → credential pool)
3. Pick the default provider and adjust the fallback order
4. Use **Test Search** to run a real query and verify

## Providers

| Provider | Search | Fetch | Best for |
| --- | :---: | :---: | --- |
| [Tavily](https://tavily.com) | ✅ | ✅ | General agent search |
| [Exa](https://exa.ai) | ✅ | ✅ | Semantic / research |
| [Firecrawl](https://firecrawl.dev) | ✅ | ✅ | Reading pages after search |
| [Brave Search](https://brave.com/search/api/) | ✅ | — | Traditional web search |
| [You.com](https://you.com) | ✅ | — | Web / News |
| [Jina](https://jina.ai) | ✅ | ✅ | Page content reading |
| [SearXNG](https://docs.searxng.org) | ✅ | — | Self-hosted |

Not sure which one?

* **General**: Tavily
* **Research / semantic**: Exa
* **Need to read pages**: Firecrawl / Jina
* **Traditional web search**: Brave
* **Self-hosted / privacy**: SearXNG

<details>
<summary><b>Provider selection reference</b>: free tiers & pricing (2026-08-16)</summary>

| Provider | Free allowance | Type | Billing |
| --- | --- | --- | --- |
| Tavily | 1,000 credits / month | monthly | credits (Basic=1) |
| Exa | $20 signup + $10/mo | signup + monthly | per request ($7/1k) |
| Firecrawl | 1,000 credits + 1,000 search credits / mo | monthly | 2 credits per 10 results |
| Brave | $5/mo ≈ 1,000 searches | monthly | per request ($5/1k) |
| You.com | $100 one-time | one-time | per call ($5/1k) |
| Jina | 10M tokens one-time | one-time | per token |
| SearXNG | no platform quota | self-hosted | none |

Pricing and free tiers come from upstream sites and may change — always check
each provider's site.

</details>

## Fallback

The attempt order for one search:

```text
Tavily → Exa → Brave → SearXNG
```

On a **recoverable** failure of the default provider, the next one is tried:

```text
401 / 403 · 408 · 429 · 5xx · network error · timeout · provider unavailable
```

A credential that fails auth is marked unhealthy while the search continues.

These errors do **not** switch providers: `400 bad request`, local
configuration errors.

Caller cancellation (abort) **terminates the whole search chain immediately** —
it never falls back.

## Settings

Configuration entry:

```text
Settings → Plugins → Plugin configuration → dsh-web-tools
```

Manages: enable toggle, default provider, fallback order, max results, timeout,
provider enable/disable, API keys / credential pools, base URLs, connection
tests, quota state, test search.

<!-- Screenshots: provider config / test search -->
<!-- ![Provider Settings](assets/settings-providers.png) -->
<!-- ![Test Search](assets/test-search.png) -->

## Credentials & Quota

### Credential pools

Each provider can hold multiple API keys:

```text
Tavily
├── Key A
├── Key B
└── Key C
```

Keys are selected **least-used-first**; a failing key is marked unhealthy and
skipped; when all keys are unavailable, health resets. Values can be separated
by commas, whitespace, newlines, or semicolons.

Credential pools are for legitimate scenarios (team keys, workspaces, key
rollover, environment isolation) — not for bypassing provider limits.

### Quota

Providers use different units (credits / requests / tokens / USD /
self-hosted); the plugin does not force them into one percentage.

Quota is split into **authoritative** and **best-effort**. Only provider-
returned authoritative quota participates in "exhausted" routing decisions;
best-effort or local estimates never do.

| Provider | Data source | Status |
| --- | --- | --- |
| Tavily | Official `/usage` | ✅ implemented |
| Firecrawl | Official `/v2/team/credit-usage` | ✅ implemented |
| You.com | Official Account Balance API | ✅ implemented |
| Exa | Team Management usage / key budget | adapter ready, UI pending |
| Brave | `X-RateLimit-*` headers | parsing ready, full display pending |
| Jina | Reader balance info | best-effort |
| SearXNG | no platform quota | self-hosted |

A quota lookup failure only affects display — never search.

## Search & Fetch

```text
web_search → candidate URLs → web_fetch → read page content
```

Tavily, Exa, Firecrawl, and Jina use their native content-fetch capabilities;
Brave, You.com, and SearXNG are used for search.

> **Current limitation**: `web_fetch` tries fetch-capable providers in search
> priority order (no longer only the default provider), but it does not reuse
> the provider that `web_search` actually hit.

## Security & Privacy

* API keys are resolved on the Host only — **full credentials never reach the
  browser** (only configured/masked state).
* Test results and logs never return full API keys.
* Config writes are restricted to the local configuration plane.
* **No dsh-web-tools remote server**, no shared keys.
* No search usage telemetry uploaded.
* Can run with self-hosted SearXNG only.

## Compatibility / Limitations

* Developed and tested against DeepSeek Harness `0.1.0-rc.6`; DSH is a
  developer preview and may introduce breaking changes.
* The settings UI's full fallback ordering editor is still being finished
  (the Host already supports full ordering).
* Exa Team Management usage settings and Brave quota display are pending.
* SearXNG quality depends on the instance and the upstream engines it enables.
* Free tiers/pricing come from upstream and may change.

## Architecture

```text
DSH Agent
   │  web_search / web_fetch
   ↓
dsh-tool-web
   ↓
ctx.web (searchProvider: dsh-web-tools)
   ↓
SearchHubProvider
   ├── Provider Registry
   ├── Fallback
   ├── Credential Pools
   ├── Quota
   ├── Health / Stats
   └── Provider Adapters (Tavily · Exa · Firecrawl · Brave · You.com · Jina · SearXNG)
```

Settings ↔ Host: `Web Client → /web-tools/api/* → Host routes (config /
credentials / test / quota) → ctx.settings / ctx.credentials`.

Routing uses no extra LLM requests and adds no model-visible tools.

## Verification

| Item | Status |
| --- | --- |
| TypeScript / Build | ✅ |
| Unit + route smoke | ✅ |
| Tavily Search + Quota | ✅ E2E |
| Exa Search + credential pool | ✅ E2E |
| Firecrawl Search + Fetch + Quota | ✅ E2E |
| Brave / You / Jina / SearXNG | adapter ready, E2E pending |

## Development

```bash
npm install
npx tsc -p tsconfig.json --noEmit           # Host
npx tsc -p tsconfig.client.json --noEmit    # Client
npx tsc -p tsconfig.build.json              # Build
node --experimental-strip-types --test src/host/logic.test.ts   # Unit
node --experimental-strip-types test/routes.smoke.mjs           # Smoke
```

Local development needs DSH peer deps resolvable (link to the DSH profile's
`node_modules`). If the plugin is missing from `--dump-config`, check bundle
loading; if the settings card is missing, fully restart `dsh web`.

## Provider development

Provider adapters live in `src/host/providers/`. Add a provider by
implementing the `ProviderAdapter` contract and registering it; provide Fetch
/ Quota implementations if supported. The agent side needs no new tools. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

* Full search-priority ordering UI
* Exa Team Management usage settings / Brave quota display
* Serper, Parallel (OAuth), Perplexity providers
* Real per-provider comparison and usage history

## Install with your coding agent

<details>
<summary>Expand the prompt</summary>

```text
Install dsh-web-tools from:
https://github.com/A3Boy/dsh-web-tools

Requirements:
- Use the current DSH profile's standard plugin install flow.
- Do not read, print, or ask me to paste API keys.
- Do not modify DeepSeek Harness core.
- After installing, check the composed config with
  `dsh --profile web --dump-config`.
- Do not terminate or restart a running DSH process without asking.
- Report whether the plugin made it into the web profile.
```

</details>

## Contributing

Issues and PRs are welcome. Before adding a search provider, review the
existing adapters and [CONTRIBUTING.md](CONTRIBUTING.md), and keep the provider
layer simple.

## License

[MIT](LICENSE) © A3Boy
