<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="160" />
</p>

# dsh-web-tools

A unified multi-provider Web Runtime for DeepSeek Harness.

It keeps the native DSH `web_search` / `web_fetch` model contract while adding provider fallback, multi-key pools, quota and health state, provider-native execution profiles, page extraction, Search Mode, proxy support, and self-hosted SearXNG.

<p align="center">
  <a href="https://github.com/A3Boy/dsh-web-tools/stargazers">
    <img src="https://img.shields.io/github/stars/A3Boy/dsh-web-tools?style=flat-square&label=Stars" alt="GitHub Stars" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-2ea44f?style=flat-square" alt="MIT License" />
  </a>
  <a href="https://github.com/deepseek-ai/deepseek-harness">
    <img src="https://img.shields.io/badge/DeepSeek%20Harness-Web%20Runtime-4D6BFE?style=flat-square" alt="DeepSeek Harness" />
  </a>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

**English** | [简体中文](README.zh-CN.md)

</div>

<p align="center">
  <img src="assets/overview.png" width="900" alt="dsh-web-tools settings" />
</p>

## More than eight API adapters

The current branch puts search, page reading and runtime policy behind one stable DSH-native Web contract:

- **8 search providers**: Exa, Tavily, Firecrawl, Parallel, Brave, You.com, Jina and SearXNG
- **Native DSH tools**: no provider-specific model tools; the Agent continues to use only `web_search` and `web_fetch`
- **Bounded multi-query**: works with DSH `queries[]`; one precise query is preferred, with parallel queries reserved for genuinely independent unknowns/source angles
- **Multi-key pools**: in-flight reservation plus same-provider auth failover
- **Deterministic provider fallback**: timeout, network, 5xx, rate-limit and quota failures can fall through to the next configured provider
- **Retry-After cooldown**: a rate-limited provider can be skipped with zero HTTP calls until the server-requested cooldown expires
- **Deeply adapted to each source's native strength**: Exa smart search, Tavily deep retrieval, Brave fast search, Jina reader, Firecrawl extraction — more than plain API calls, each provider runs on its official capability; the settings page presents them as human-readable preferences, never parameter names
- **Global Search Mode**: one-click 推荐 / 快速 / 精准 / 节省 that applies the right native options and order per provider — or switch to 自定义 and tune the order yourself
- **Native page / extract backends**: provider-specific Contents / Extract / Scrape / Reader APIs power `web_fetch`
- **Per-session Search Mode**: force web research before answering, without changing the native DSH tool schema
- **Proxy and self-hosting**: `HTTP(S)_PROXY`, Windows system proxy, `NO_PROXY`, and keyless self-hosted SearXNG

The project does not provide shared API keys or operate a relay service. Requests go directly from the local DSH Host to each configured provider.

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

The current development branch completed P5 live evaluation on a DSH rc.8 runtime. `package.json` still keeps the rc.6-compatible peer range.

## Provider capabilities

| Provider | Search | Page / Extract | Main integration |
| --- | :---: | :---: | --- |
| [Exa](https://exa.ai) | ✅ | ✅ `/contents` | auto/fast/deep modes, query-aware highlights, content freshness |
| [Tavily](https://tavily.com) | ✅ | ✅ `/extract` | basic/advanced/fast/ultra-fast, auto parameters |
| [Firecrawl](https://firecrawl.dev) | ✅ | ✅ `/scrape` | discovery search, clean main-content scraping, cache controls |
| [Parallel](https://parallel.ai) | ✅ | ✅ `/v1/extract` | advanced/basic/turbo, LLM-ranked excerpts, `max_chars_total` |
| [Brave Search](https://brave.com/search/api/) | ✅ | — | LLM Context first, Classic Web Search fallback |
| [You.com](https://you.com) | ✅ | ✅ `/v1/contents` | Search highlights, Markdown contents, crawl timeout/cache |
| [Jina](https://jina.ai) | ✅ | ✅ Reader | Search + Reader, LLM-friendly page content |
| [SearXNG](https://docs.searxng.org) | ✅ | — | keyless self-hosted meta-search |

> Parallel's current public Search documentation lists `turbo`, `basic`, and `advanced`. Turbo is currently documented for English and Japanese queries, so dsh-web-tools does not make it the global default.

<p align="center">
  <img src="assets/providerDetail.png" width="900" alt="Provider settings and search preferences" />
</p>

## Recommended starting point

New installations now default to **Exa**. This is a product default derived from this repository's own P5 fixed-corpus evaluation; it is not a universal ranking of search providers.

| Use case | Try first |
| --- | --- |
| Default / technical search | **Exa** |
| Low-latency Agent grounding | Brave LLM Context |
| Search + Extract | Tavily / Parallel |
| Page extraction | Firecrawl / Jina / You.com |
| Web / News | You.com |
| Self-hosted | SearXNG |

One provider is enough to use the plugin. Multiple configured providers enable fallback.

## P5: data-backed defaults

The current branch includes a reproducible evaluation run:

- 7 providers × 36 fixed tasks
- 252 default-profile searches
- 132 provider-profile A/B searches
- multi-query, fallback, key trimming and provider-option isolation checks

Default-profile results:

| Provider | Top-1 | Top-3 | Official source | Generic rate | Median latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Exa** | **72.2%** | **97.2%** | **75.0%** | **0%** | 1.35s |
| Brave | 50.0% | 94.4% | 50.0% | 2.8% | **0.90s** |
| You.com | 55.6% | 91.7% | 55.6% | **0%** | 1.26s |
| Parallel | 52.8% | 88.9% | 58.3% | 5.6% | 1.95s |
| Tavily | 47.2% | 88.9% | 47.2% | 5.6% | 2.18s |

Raw reports are committed under:

```text
reports/p5/
```

Key decisions from the run:

- Exa became the new-install default because it had the strongest overall evidence profile in this corpus
- Exa `fast` is a strong latency profile, but `auto` remains the recommended default because the evaluation did not prove a quality advantage for `fast`
- Tavily `basic` stays recommended; `advanced` did not justify its extra cost in this corpus
- two genuinely independent queries were the clearest multi-query sweet spot; four mostly increased source diversity and cost
- the Search Mode prompt explicitly rejects paraphrase spam in `queries[]`
- Firecrawl is better positioned as a page-extraction/fallback provider than as the primary search provider

These numbers describe this repository's fixed corpus and the upstream API/account state at the time of the run. They are not a general-purpose third-party leaderboard.

## Human-friendly provider profiles

Provider-native parameters stay native in storage and adapters, but the UI exposes human-readable choices rather than raw API knobs.

Examples:

```text
Exa
Balanced / Fast / Deep

Tavily
Balanced / Quality / Fast / Ultra-fast

Brave
Smart Context / Classic Web Search

You.com
AI Highlights / Short Snippets

Parallel
Quality / Balanced / Turbo
```

Only user overrides are persisted. “Restore recommended” removes the override so future plugin defaults can evolve cleanly.

## Search + Extract / Fetch

Search is only half of the retrieval pipeline. Several providers already use native content/extraction endpoints behind `web_fetch`:

```text
Exa        /contents
Tavily     /extract
Firecrawl  /scrape
Parallel   /v1/extract
You.com    /v1/contents
Jina       Reader
```

Typical flow:

```text
web_search
    ↓
relevant URL
    ↓
web_fetch
    ↓
page / extracted content
```

Search and Fetch do not have to use the same provider. For example:

```text
Brave LLM Context
    ↓
URL
    ↓
Parallel Extract
```

A future research track will evaluate query-aware focused extraction rather than simply adding more Search knobs.

## Provider order and fallback

Providers can be reordered by drag-and-drop. The first provider is the default search backend.

Example:

```text
Exa → Brave → You.com → Tavily → Parallel → Firecrawl → Jina
```

The runtime can continue to the next provider on:

```text
rate limit
timeout
network error
5xx
quota exhaustion
```

If one API key fails authentication and a provider has multiple keys, another healthy key is tried inside the same provider first.

### Retry-After cooldown

When a provider returns HTTP 429 with `Retry-After`, the provider is placed into a temporary cooldown. During the cooldown, later searches skip it with zero HTTP calls and continue through the configured chain.

## Multiple API keys

Hosted providers can use multiple API keys:

```text
Exa
├── Key A
├── Key B
└── Key C
```

Concurrent searches prefer low-`inFlight` healthy keys. Full API keys are never returned to the browser.

## Quota

Current quota support:

| Provider | Quota |
| --- | :---: |
| Tavily | ✅ |
| Firecrawl | ✅ |
| Brave | ✅ via Search response headers |
| You.com | ✅ |
| Jina | Best effort |
| Exa | — |
| Parallel | Dashboard only |
| SearXNG | Self-hosted |

Quota is primarily a settings/diagnostics signal. Estimated values do not silently rewrite provider order.

## Test Search

The Settings page can run a real request through the same Registry and provider profiles used by the Agent. It shows:

- final provider
- total latency
- result count
- provider attempts
- success / timeout / rate limit / authentication failure
- returned sources

<p align="center">
  <img src="assets/overviewAndTestSearch.png" width="850" alt="Test Search" />
</p>

## Per-session Web Search mode

The input-row “Web Search” toggle controls research behavior for the current conversation:

- **off** — let the Agent decide whether web access is needed
- **on** — complete at least one web research action before answering; fetch a provided URL directly, otherwise search first
- one concrete fact starts with one precise query
- two queries are for two independent unknowns or genuinely different source angles
- 3–4 are reserved for tasks that truly contain that many distinct facts
- paraphrase spam is explicitly discouraged
- one precise reformulation is allowed when the first search is generic
- if web research fails, the Agent is asked to disclose which current facts could not be verified

<p align="center">
  <img src="assets/searchMode.png" width="480" alt="Web Search toggle" />
</p>

## Proxy and SearXNG

Supported proxy sources:

```text
HTTPS_PROXY
HTTP_PROXY
Windows system proxy
NO_PROXY
```

Local addresses (`localhost`, `127.0.0.1`, `::1`, `*.local`) bypass the proxy by default.

SearXNG requires no API key; configure only your own instance URL, for example:

```text
http://127.0.0.1:8080
```

## Security

- API keys stay on the DSH Host
- full keys are never returned to the browser
- logs do not include full credentials
- requests are not relayed through a server operated by this project
- no search usage telemetry is uploaded
- SearXNG can be used as a fully self-hosted search backend
- runtime/provider errors must not expose Authorization or API key material

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
npm run typecheck
```

Build:

```bash
npm run build
```

After changing `src/`, rebuild and commit the generated `lib/` artifacts too. This package intentionally has no `prepare` script; GitHub installs use the committed build output.

Provider adapters:

```text
src/host/providers/
```

P5 evaluation artifacts:

```text
reports/p5/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development details.

## Update still showing old code?

If an update still behaves like an older snapshot after restarting:

```bash
cd ~/.dsh/profiles/web
pnpm install
```

For local development, prefer `link:` over `file:` to avoid copied stale snapshots.

## Contributing

Issues and pull requests are welcome, including new providers, extraction capabilities, and reproducible benchmark data.

## License

[MIT](LICENSE) © A3Boy
