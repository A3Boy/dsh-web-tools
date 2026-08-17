<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="160" />
</p>

# dsh-web-tools

Multi-provider Web Search / Fetch plugin for DeepSeek Harness.

Supports Tavily, Exa, Firecrawl, Parallel, Brave, You.com, Jina, and SearXNG with provider ordering, automatic fallback, multiple API keys, and quota display.

Uses the native DSH `web_search` / `web_fetch` tools.

<p align="center">
  <a href="https://github.com/A3Boy/dsh-web-tools/stargazers">
    <img src="https://img.shields.io/github/stars/A3Boy/dsh-web-tools?style=flat-square&label=Stars" alt="GitHub Stars" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-2ea44f?style=flat-square" alt="MIT License" />
  </a>
  <a href="https://github.com/deepseek-ai/deepseek-harness">
    <img src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-4D6BFE?style=flat-square" alt="DeepSeek Harness" />
  </a>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

**English** | [简体中文](README.zh-CN.md)

</div>

<p align="center">
  <img src="assets/overview.png" width="900" alt="dsh-web-tools settings" />
</p>

## Features

- Tavily, Exa, Firecrawl, Parallel, Brave, You.com, Jina, SearXNG
- Configurable provider order and fallback
- Multiple API keys per provider
- Quota, key health, and connection test
- Native `web_search` / `web_fetch`
- Per-session "Web Search" toggle
- System proxy and self-hosted SearXNG

The plugin does not provide shared API keys or a proxy service. Requests go directly from the local DSH Host to each provider.

## Installation

```bash
dsh plugin --profile web add github:A3Boy/dsh-web-tools
```

Restart `dsh web`, then open:

```text
Settings → Web Search
```

Update:

```bash
dsh plugin --profile web update dsh-web-tools
```

Remove:

```bash
dsh plugin --profile web remove dsh-web-tools
```

**For contributors**: this repo has no `prepare` script. After changing `src/`, run `npm run build` manually and commit the compiled `lib/` together with your change (otherwise installs fetch stale artifacts). CI also runs `npm run build` to enforce consistency.

Currently developed and tested against DeepSeek Harness `0.1.0-rc.6`.

## Providers

| Provider | Search | Fetch | Quota |
| --- | :---: | :---: | :---: |
| [Tavily](https://tavily.com) | ✅ | ✅ | ✅ |
| [Exa](https://exa.ai) | ✅ | ✅ | — |
| [Firecrawl](https://firecrawl.dev) | ✅ | ✅ | ✅ |
| [Parallel](https://parallel.ai) | ✅ | ✅ | Dashboard only |
| [Brave Search](https://brave.com/search/api/) | ✅ | — | ✅ |
| [You.com](https://you.com) | ✅ | — | ✅ |
| [Jina](https://jina.ai) | ✅ | ✅ | Best effort |
| [SearXNG](https://docs.searxng.org) | ✅ | — | Self-hosted |

<p align="center">
  <img src="assets/providerDetail.png" width="900" alt="Provider settings and quota" />
</p>

A simple starting point:

| Use case | Try |
| --- | --- |
| General search | Tavily |
| Semantic / technical search | Exa |
| Search + page content | Firecrawl / Parallel / Jina |
| General Web search | Brave |
| Web / News | You.com |
| Self-hosted | SearXNG |

You do not need to configure every provider.

One provider is enough to use the plugin. Multiple providers enable fallback.

## Free tier reference

<details>
<summary>Free / signup credits (check upstream for current details)</summary>

| Provider | Free / signup credits |
| --- | --- |
| Tavily | 1,000 credits / month |
| Exa | $20 on signup + $10 / month |
| Firecrawl | 1,000 credits / month |
| Parallel | Up to $80 on signup + $5 / month |
| Brave Search | $5 credits / month |
| You.com | $100 for new accounts |
| Jina | 10M tokens for a new API key |
| SearXNG | Self-hosted, no platform quota |

</details>

Some free tiers require account registration or a payment method. Check the upstream provider rules.

Parallel and You.com also offer separate free MCP Search endpoints. The providers in this plugin currently use their REST APIs and therefore still use API keys.

## Provider order

Set the order in which providers are used:

```text
Tavily → Firecrawl → Exa → Parallel → Brave
```

The first provider is the default.

Providers in the search chain can be reordered by dragging.

Removing a provider from the chain does not delete its configuration, so it can still be tested manually.

## Fallback

The plugin tries the next provider when the current one has problems such as:

```text
rate limit
timeout
network error
service error
quota exhausted
```

Example:

```text
Tavily
   ↓ timeout
Firecrawl
   ↓
success
```

<p align="center">
  <img src="assets/searchfallback.png" width="850" alt="Provider fallback" />
</p>

If an API key fails authentication and the provider has multiple keys, another available key is tried first.

## Multiple API keys

Each provider can have multiple API keys:

```text
Tavily
├── Key A
├── Key B
└── Key C
```

The plugin automatically selects an available key.

Keys can be separated by:

```text
newlines
commas
spaces
semicolons
```

Full API keys are never returned to the browser. The Settings page only receives masked credential information.

## Quota

Current quota support:

| Provider | Quota |
| --- | :---: |
| Tavily | ✅ |
| Firecrawl | ✅ |
| Brave | ✅ |
| You.com | ✅ |
| Jina | ✅ |
| Exa | — |
| Parallel | Dashboard only |
| SearXNG | Self-hosted |

For supported providers, quota from multiple API keys is combined.

Example:

```text
Key A: 950 / 1000
Key B: 982 / 1000

Pool: 1932 / 2000
```

Quota is refreshed in the background with a default 5-minute cache.

Brave quota is read from the `X-RateLimit-*` information returned by Search and the latest result is saved.

Quota information is only used for display and does not block Search.

## Test Search

The Settings page can run a real search through the configured provider chain.

It shows:

- final provider
- total latency
- result count
- provider attempts
- success / timeout / rate limit / authentication failure
- search results

<p align="center">
  <img src="assets/overviewAndTestSearch.png" width="850" alt="Test Search" />
</p>

Test Search uses the same provider chain as normal agent searches.

## Web Fetch

Providers with page-content support:

```text
Tavily
Exa
Firecrawl
Parallel
Jina
```

A normal flow can be:

```text
web_search
    ↓
URL
    ↓
web_fetch
    ↓
page content
```

Search and Fetch do not have to use the same provider.

For example:

```text
Brave Search
    ↓
Parallel Fetch
```

## Proxy

Supports:

```text
HTTPS_PROXY
HTTP_PROXY
Windows system proxy
```

Local addresses bypass the proxy by default:

```text
localhost
127.0.0.1
::1
*.local
```

`NO_PROXY` is also supported.

## SearXNG

SearXNG does not require an API key.

Configure only the instance URL:

```text
http://127.0.0.1:8080
```

It can be used alone:

```text
SearXNG
```

or as part of the fallback chain:

```text
Tavily → Exa → Brave → SearXNG
```

## UI language

The Web Search page supports:

```text
Follow system
中文
English
```

The language setting only affects this plugin page.

## Per-session "Web Search" toggle

A small "Web Search" toggle sits at the left end of the input row. Click it to
turn it on or off; once on, it stays on until you click again.

- **off** — lets the AI decide on its own whether a question needs a web search
- **on** — runs at least one web search before answering each turn; when a
  search can't complete, the agent is asked to say which parts were not
  web-verified
- the state follows the current conversation: refreshing the page or switching
  conversations doesn't lose it
- the button grays out when there is no usable search source (the plugin is
  disabled, or no search source is available)
- you can also use `/search` to toggle the same switch

It works with the 8 search sources: when on, the search automatically falls
back through the sources in the order you've configured.

<p align="center">
  <img src="assets/searchMode.png" width="480" alt="Web Search toggle" />
</p>

## Security

- API keys are used only on the DSH Host
- full API keys are never returned to the browser
- logs do not contain full API keys
- requests do not pass through a server operated by this project
- no search usage telemetry is uploaded
- SearXNG can be used as a fully self-hosted search option

## Development

Install:

```bash
npm install
```

Test:

```bash
npm test
```

Type-check:

```bash
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.client.json --noEmit
```

Build:

```bash
npm run build
```

After changing `src/`, run `npm run build` and commit the resulting `lib/` too. The package has no `prepare` script, so GitHub installs use the committed `lib/` directly — keep it in sync with `src/`.

Provider adapters are in:

```text
src/host/providers/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for more information.

## Update still showing old code?

If the plugin still behaves like an older version after updating and restarting:

```bash
cd ~/.dsh/profiles/web
pnpm install
```

For local development, `file:` may use a copied snapshot.

Using `link:` is usually more convenient.

## Contributing

Issues and pull requests are welcome.

New Search Provider suggestions are welcome too.

## License

[MIT](LICENSE) © A3Boy
