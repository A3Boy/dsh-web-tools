<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="180" />
</p>

# dsh-web-tools

A multi-provider Web Search / Fetch plugin for DeepSeek Harness.

`dsh-web-tools` connects multiple search services through DSH's native
`ctx.web` and manages providers, credentials, quota state, and fallback from a
single settings page. The agent still uses DSH's existing `web_search` and
`web_fetch` — it never needs to know whether the underlying service is Tavily,
Exa, Brave, or something else.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/Tests-12%20unit%20%2B%20smoke%20passing-brightgreen.svg)](test/)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

**English** | [简体中文](README.zh-CN.md)

</div>

<!-- Replace with a real Settings screenshot before release -->

<!-- ![dsh-web-tools Settings](assets/settings.png) -->

## Features

* Supports Tavily, Exa, Firecrawl, Brave, You.com, Jina, and SearXNG.
* Exposes capabilities through DSH's native `web_search` / `web_fetch` — no
  extra model tools like `tavily_search` or `exa_search`.
* Configurable default search provider and an ordered fallback chain.
* Each provider can hold multiple credentials, selected least-used-first.
* Tracks provider/credential states: auth failure, rate limit, timeout, quota
  exhaustion, etc.
* Reads balance or quota info when the upstream provides an API, and marks the
  data source.
* Tavily, Exa, Firecrawl, and Jina support content fetching after search.
* SearXNG can be the default source or a fallback — no commercial Search API
  required.
* Ships a DSH web settings card: providers, credentials, timeouts, search
  parameters, connection tests, and test search.

## Supported Providers

| Provider | Search | Fetch | Quota / Usage | Notes |
| --- | :---: | :---: | --- | --- |
| [Tavily](https://tavily.com) | ✅ | ✅ | Official `/usage` | Agent/RAG-oriented Search, Extract, Crawl |
| [Exa](https://exa.ai) | ✅ | ✅ | Usage / Key Budget | Semantic search; returns page text and highlights |
| [Firecrawl](https://firecrawl.dev) | ✅ | ✅ | Official Credit Usage | Search, Scrape, Crawl — good for reading pages after search |
| [Brave Search](https://brave.com/search/api/) | ✅ | — | Rate-limit headers | Uses Brave's independent web index |
| [You.com](https://you.com) | ✅ | — | Official Balance API | Web + News; many results per call |
| [Jina](https://jina.ai) | ✅ | ✅ | Best-effort token balance | Search + Reader; turns pages into LLM-friendly text |
| [SearXNG](https://docs.searxng.org) | ✅ | — | No platform quota | Self-hosted meta search |

Planned: Serper, Parallel, Perplexity.

### Provider characteristics at a glance

| Dimension | Tavily | Exa | Firecrawl | Brave | You.com | Jina | SearXNG |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Positioning** | Default agent/RAG search | Semantic / neural retrieval | Search → Scrape → Crawl | Independent web index | General search + News | Search + Reader | Self-hosted meta search |
| **Strengths** | Search+Extract+Crawl+Map in one API | Finds similar/relevant content, returns text/highlights | Dynamic pages → clean Markdown | Own index: Web/News/Images/Videos/LLM context | Up to 100 results, rich filters | `s.jina.ai` search + `r.jina.ai` URL→LLM text | Aggregates many sources, privacy, no profiling |
| **Fetch** | ✅ Extract | ✅ returns content | ✅ Scrape/Crawl | — | — (has Livecrawl, adapter not wired) | ✅ Reader | — |
| **Free tier** | 1,000 credits/mo | $20 signup + $10/mo | 1,000 credits/mo + 1,000 search credits | $5/mo ≈ 1,000 searches | $100 one-time | 10M tokens one-time | no platform quota |
| **Billing** | credits (Basic=1) | per request ($7/1k) | 2 credits per 10 results | per request ($5/1k) | per call ($5/1k) | per token | none |
| **Best for** | ⭐ general default | 🧠 research / semantic | 📖 read pages after search | 🌐 general realtime | 💰 large free experiments | 📄 web → LLM text | 🏠 permanent fallback / private |

Notes ⚠️:

- **Tavily / Exa / Firecrawl / Jina** all carry content-fetch capabilities —
  `web_search` finds URLs, then `web_fetch` reads the page.
- **You.com** has an official Contents / Livecrawl API, but the current
  `dsh-web-tools` You.com adapter is search-focused.
- **Brave** requires a card on file for its free plan (anti-abuse).
- **SearXNG** has no platform quota, but upstream search sources are not
  unlimited — availability depends on instance config, network, and engines.
- Free tiers and prices follow each provider's site and may change.

## Free tier reference

Compiled from official pages as of **2026-08-16**. Free plans and prices may
change — always check each provider's site.

| Provider | Current free allowance | Type |
| --- | --- | --- |
| Tavily | 1,000 credits / month | monthly refresh |
| Exa | $20 signup credits; then $10 / month | signup + monthly refresh |
| Firecrawl | 1,000 credits / month; Pricing also lists +1,000 search credits | monthly refresh |
| Brave Search | $5 credits / month, ~1,000 searches | monthly refresh |
| You.com | $100 credits for new accounts | one-time |
| Jina | 10M tokens for new users | one-time |
| SearXNG | No platform quota | self-hosted |

If you are unsure where to start, begin with Tavily or Exa; add Brave for
traditional web coverage, and Firecrawl or Jina when you need to keep reading
pages. SearXNG fits as a self-hosted option or a last-resort fallback.

## Provider priority & fallback

The Host decides the attempt order for one search from:

```text
defaultProvider
fallbackOrder[]
maxFallbackProviders
```

For example:

```text
Tavily → Exa → Brave → SearXNG
```

After a Tavily request fails, only errors classified as recoverable move on to
the next provider.

Currently fallback is triggered by:

```text
401 / 403
408
429
5xx
network error
request timeout
provider unavailable
request cancelled
```

A credential that fails authentication is marked unhealthy while the search
continues to the next provider.

These errors do NOT switch providers:

```text
400 bad request
local configuration error
```

Unknown provider errors currently try the next provider.

Each search records the providers actually attempted, result states, and
latency, so issues can be diagnosed from the settings page or logs.

### Sorting in the settings page

The Host already supports a full ordered `fallbackOrder`.

The current settings card can change the default provider and fallback config;
a complete ordered-sorting interaction is still being finished. The plan is to
let the settings page edit the whole search priority directly, instead of only
adjusting the first fallback entry.

Internal config stays:

```text
defaultProvider + fallbackOrder
```

UI changes never alter the Host's routing contract.

## Credential pools

Each provider can hold multiple API keys.

```text
Tavily
├── Key A
├── Key B
└── Key C
```

The current selection policy is **least-used-first**:

1. Pick the healthy credential with the fewest uses.
2. Ties break by configured order.
3. A key that fails a call is marked unhealthy and temporarily skipped.
4. When every key in the pool is unavailable, health resets so later requests
   can retry.

Credential values can be separated by commas, whitespace, newlines, or
semicolons.

Credential pools are for legitimate multi-credential scenarios (team keys,
different workspaces, key rollover, environment isolation) — not for bypassing
a provider's account or service limits.

## Quota tracking

Different providers use different quota units, so the plugin does not force
them into one fake percentage.

Possible types:

```text
credits
requests
tokens
USD
self-hosted
```

The implementation distinguishes authoritative from non-authoritative data.
Only provider-returned authoritative quota may drive the router's
"exhausted" decision; best-effort or local estimates never do.

| Provider | Data source | Current status |
| --- | --- | --- |
| Tavily | Official `/usage` | implemented |
| Firecrawl | Official `/v2/team/credit-usage` | implemented |
| You.com | Official Account Balance API | implemented |
| Exa | Team Management usage / key budget | adapter present, settings UI in progress |
| Brave | `X-RateLimit-*` in search responses | header parsing present, full quota display in progress |
| Jina | balance info in Reader responses | best-effort |
| SearXNG | no platform quota | self-hosted |

A quota lookup failure only affects the status display — it never affects a
provider's Search capability.

## Search & Fetch

The agent side still uses:

```text
web_search
web_fetch
```

Typical flow:

```text
web_search
    ↓
candidate URLs
    ↓
web_fetch
    ↓
read page content
```

Today the Tavily, Exa, Firecrawl, and Jina adapters can use their native
content-fetch capabilities. Brave, You.com, and SearXNG are currently used as
search providers.

## Settings page

After installing into the `web` profile, the configuration entry is:

```text
Settings
→ Plugins
→ Plugin configuration
→ dsh-web-tools
```

The settings card currently manages:

* plugin enable state
* default provider
* fallback config
* max results
* search timeout
* provider enable / disable
* API keys / credential pools
* provider base URLs
* provider connection tests
* quota status
* test search

Test Search runs a real search and returns the actual provider used, latency,
and results — no agent session needed.

<!-- Consider adding two real screenshots:
![Provider Settings](assets/settings-providers.png)
![Test Search](assets/test-search.png)
-->

## SearXNG

Once SearXNG is configured, place it anywhere in the search priority:

```text
Tavily → Exa → Brave → SearXNG
```

Or configure only SearXNG and skip commercial search providers entirely.

This suits local deployments, homelabs, enterprise intranets, or environments
that want to control their own search infrastructure.

## Install

The repo can be installed directly from GitHub:

```bash
dsh plugin --profile web add github:A3Boy/dsh-web-tools
```

After installing, restart the running `dsh web`, then open the plugin settings
page to configure providers.

Check the composed profile:

```bash
dsh --profile web --dump-config
```

Update:

```bash
dsh plugin --profile web update dsh-web-tools
```

Remove:

```bash
dsh plugin --profile web remove dsh-web-tools
```

The plugin integrates as a DSH profile bundle — no DeepSeek Harness core
changes required.

> If an npm package is published later, the npm install command becomes the
> default while keeping the GitHub install path.

## Configuration

Sensitive credentials are stored by DSH Credentials.

Current credential refs:

| Provider | Credential ref | Notes |
| --- | --- | --- |
| Tavily | `WEB_TOOLS_TAVILY` | multiple keys supported |
| Exa | `WEB_TOOLS_EXA` | multiple keys supported |
| Firecrawl | `WEB_TOOLS_FIRECRAWL` | Search + Scrape |
| Brave | `WEB_TOOLS_BRAVE` | `X-Subscription-Token` |
| You.com | `WEB_TOOLS_YOU` | Search + Balance |
| Jina | `WEB_TOOLS_JINA` | Search + Reader |
| SearXNG | `WEB_TOOLS_SEARXNG` | self-hosted config |

Non-sensitive config lives in the `dsh-web-tools` settings namespace.

Main keys:

```text
enabled
defaultProvider
fallbackOrder
maxFallbackProviders
maxResults
searchTimeoutMs
providerBaseUrls
providerEnabled
```

## Architecture

```text
DSH Agent
   │
   │ web_search / web_fetch
   ↓
dsh-tool-web
   ↓
ctx.web
   │ searchProvider: dsh-web-tools
   ↓
SearchHubProvider
   ├── Provider Registry
   ├── Fallback
   ├── Credential Pools
   ├── Quota
   ├── Health / Stats
   └── Provider Adapters
        ├── Tavily
        ├── Exa
        ├── Firecrawl
        ├── Brave
        ├── You.com
        ├── Jina
        └── SearXNG
```

Settings page ↔ Host:

```text
Web Client
   ↓
/web-tools/api/*
   ↓
Host routes
   ├── config
   ├── credentials
   ├── provider test
   ├── test search
   └── quota
   ↓
ctx.settings / ctx.credentials
```

Provider routing uses no extra LLM requests and adds no model-visible tools.

## Security

API keys are resolved only on the Host — full credentials are never returned
to the browser.

Also:

* The browser only gets configured/masked credential state.
* Test results and logs never return full API keys.
* Config writes are restricted to the local configuration plane.
* No `dsh-web-tools` remote server is required.
* No shared API keys.
* The plugin does not upload search usage telemetry.
* It can run with self-hosted SearXNG only.

## Current verification

The repo currently passes:

| Item | Status |
| --- | --- |
| Host TypeScript typecheck | ✅ |
| Client TypeScript typecheck | ✅ |
| Unit tests (pool / fallback / Jina balance / Brave header) | ✅ 12 passing |
| Route smoke (config · credential hiding · quota · test · loopback fence) | ✅ |
| Tavily real search + official quota | ✅ |
| Exa real search + dual-key credential pool | ✅ |
| Firecrawl real search + fetch + quota | ✅ |
| Web profile `--dump-config` install check | ✅ |
| Non-loopback config write rejected | ✅ |

Brave, You.com, Jina, and SearXNG have adapters but are not yet marked at the
same real-E2E level as Tavily / Exa / Firecrawl; this table will be updated as
they are verified.

## Current limitations

* Host supports full `fallbackOrder`; the settings UI's full ordering editor
  is still pending.
* Exa Team Management usage has an adapter; the settings page still needs the
  corresponding configuration.
* Brave rate-limit header parsing exists; full quota/describe display is not
  wired yet.
* Provider free tiers and pricing come from upstream services, are not a
  stable API of this project, and may change.
* Self-hosted SearXNG quality and stability depend on the instance and the
  upstream engines it enables.

## Development

```bash
npm install

# Host
npx tsc -p tsconfig.json --noEmit

# Client
npx tsc -p tsconfig.client.json --noEmit

# Build
npx tsc -p tsconfig.build.json

# Unit tests
node --experimental-strip-types --test src/host/logic.test.ts

# Route smoke tests
node --experimental-strip-types test/routes.smoke.mjs
```

Local development needs DSH peer dependencies resolvable — linking the
development directory to the DSH profile's `node_modules` works.

If the plugin does not appear in:

```bash
dsh --profile web --dump-config
```

first check that the profile loads the `dsh-web-tools` bundle.

If the settings card does not appear, fully restart `dsh web`. The client
bundle loads at process startup.

## Provider development

Provider adapters live in:

```text
src/host/providers/
```

Adding a provider means implementing the `ProviderAdapter` contract and
registering it in the provider registry.

A search adapter converts the third-party API response into the plugin's
unified result; if the provider also supports Fetch or Quota, provide those
implementations too.

The agent side needs no new tools.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more conventions.

## Roadmap

* Full search-priority / fallback ordering UI
* Exa Team Management usage settings
* Brave quota/describe integration
* Serper provider
* Parallel provider with OAuth balance
* Perplexity provider
* Real per-provider search comparison and testing
* Usage history display

The roadmap is not a fixed version commitment; order may change based on
implementation and upstream API changes.

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

Issues and PRs are welcome.

To add a new search provider, review the existing adapters and
[CONTRIBUTING.md](CONTRIBUTING.md) first, and keep the provider layer simple —
no new agent tools or extra routing layers.

## License

[MIT](LICENSE) © A3Boy
