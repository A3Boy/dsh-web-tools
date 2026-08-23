<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="160" />
</p>

# dsh-web-tools

A unified multi-provider Web Runtime for DeepSeek Harness.

Preserves the native DSH `web_search` / `web_fetch` tool contracts while providing multi-provider aggregation, automatic fallback, multi-key pooling, quota and health monitoring, provider-native preference tuning, page content extraction, and per-session Search Mode at the host runtime layer.

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
  <img src="assets/searchOrderAndRouting.png" width="900" alt="dsh-web-tools settings and multi-provider routing" />
</p>

## Features

- **Zero-Overhead SearchHints Semantic Layer**: Built-in deterministic intent extraction directly from queries (coding, academic research, news freshness, and domain constraints like `site:github.com` or `after:YYYY-MM-DD`), intelligently mapping to native parameters and specialized indices without LLM planning overhead or latency.
- **8 Search Providers Deeply Adapted**:
  - **Parallel**: Dual-layer semantics (`objective` soft-steering + clean `search_queries`) and `source_policy` domain/freshness filters.
  - **Firecrawl**: Coding/technical queries query the **Developer Index** (`categories: ["developer"]`), supporting `research` and `tbs` time filters.
  - **Exa**: Exact category mapping (`publication` / `news` / `financial report`), ISO-8601 date ranges, and domain constraints.
  - **You.com**: Native **`boost_domains`** soft-weighting, freshness presets, and geo/language targeting.
  - **Brave Search**: LLM Context endpoint with `pd/pw/pm/py` freshness filters, country, and search language.
  - **Tavily**: Full-tier `chunks_per_source` chunking control, `news` topic and time range filtering (gracefully falls back to general search for finance/code).
  - **SearXNG**: Self-hosted metasearch with `categories` (it/science/news) and `time_range`.
  - **Jina**: Query noise reduction and ReaderLM-v2 high-precision markdown extraction.
- **Native DSH Tool Compatibility**: No bespoke tools like `web_search_exa`; agents invoke standard `web_search` and `web_fetch` contracts seamlessly.
- **Multi-Query Support**: Handles DSH `queries[]` payloads concurrently across independent search dimensions.
- **Multi-API-Key Pooling**: Assigns keys per provider, balances concurrent requests by lowest in-flight count, and fails over across keys on authentication errors.
- **Deterministic Provider Fallback**: Automatically cascades through the fallback chain on network failures, timeouts, 5xx server errors, 429 rate limits, or exhausted quotas.
- **429 Retry-After Cooldown**: Enforces zero-request cooldown windows when servers return `Retry-After` headers, skipping rate-limited providers immediately without redundant network overhead.
- **Configurable Routing Policies**: Supports Ordered, Round-Robin, and Random initial provider routing.
- **One-Click Preference Presets**: Offers Fast, Deep, Economy, and Recommended presets to quickly adjust execution parameters across providers.
- **Native Page Extraction (Extract / Scrape)**: Transparently routes `web_fetch` to provider-native scraping backends (Exa `/contents`, Tavily `/extract`, Firecrawl `/scrape`, Parallel `/v1/extract`, You.com `/v1/contents`, Jina Reader).
- **Session-Level Search Mode**: Chat input toggle that forces the agent to complete web research before generating answers.
- **Proxy and Self-Hosted Support**: Full support for system proxies, `HTTP(S)_PROXY`, `NO_PROXY`, and self-hosted SearXNG instances without API keys.

> dsh-web-tools does not provide shared API keys or proxy services. All requests originate directly from the local DSH host process to upstream APIs.

## Installation & Updates

### Install

```bash
dsh plugin --profile web add github:A3Boy/dsh-web-tools
```

Restart `dsh web` and navigate to:

```text
Settings → Web Search
```

### Update

```bash
dsh plugin --profile web update dsh-web-tools
```

The settings card checks GitHub Releases in the background and prompts when a new stable version is available.

### Uninstall

```bash
dsh plugin --profile web remove dsh-web-tools
```

## Provider Capabilities

| Provider | Search | Fetch / Extract | Key Integrations & Deep Adaptations | Quota Inspection |
| --- | :---: | :---: | --- | :---: |
| [Exa](https://exa.ai) | ✅ | ✅ `/contents` | Semantic retrieval (`auto` / `fast` / `deep`), `category` mappings (publication / news / financial report), query-aware highlights, ISO-8601 date ranges, domain filters | Dashboard only |
| [Tavily](https://tavily.com) | ✅ | ✅ `/extract` | Search depth (`basic` / `advanced` / `fast` / `ultra-fast`), full-tier `chunks_per_source` control, `news` topic & time range filters, auto parameters | ✅ Official API |
| [Firecrawl](https://firecrawl.dev) | ✅ | ✅ `/scrape` | Structured search, coding queries routed to **Developer Index**, `research` category, `tbs` time filters, clean markdown scraping, `onlyMainContent` filter | ✅ Official API |
| [Parallel](https://parallel.ai) | ✅ | ✅ `/v1/extract` | Agent-optimized dual-layer search (`advanced` / `basic` / `turbo`), `objective` soft-steering, `source_policy` domain/freshness filters, LLM-ranked excerpts, full content extraction | Dashboard only |
| [Brave Search](https://brave.com/search/api/) | ✅ | — | LLM Context endpoint preferred, `pd/pw/pm/py` freshness presets, country & search language targeting, automatic fallback to Classic Web Search | ✅ Response headers |
| [You.com](https://you.com) | ✅ | ✅ `/v1/contents` | AI highlights extraction, native **`boost_domains`** soft-weighting, freshness & geo targeting, Markdown contents endpoint | ✅ Official API (USD) |
| [Jina](https://jina.ai) | ✅ | ✅ Reader | Query noise reduction, ReaderLM-v2 markdown conversion, token budget guards | Best effort (Reader) |
| [SearXNG](https://docs.searxng.org) | ✅ | — | Open-source meta-search engine, category mappings (it/science/news) & `time_range`, keyless and privacy-focused | Self-hosted (unlimited) |

<p align="center">
  <img src="assets/providerDetail.png" width="900" alt="Provider settings and search preferences" />
</p>

## Configuration & Feature Matrix

| Setting | Location | Options / Format | Impact & Behavior |
| :--- | :--- | :--- | :--- |
| **Master Toggle (Enabled)** | Header row | Switch toggle | Globally enables or disables the multi-provider Web runtime. When off, reverts to standard DSH behavior. |
| **Search Routing Policy** | Header strategy bar | Ordered / Round-Robin / Random | **Ordered**: always starts from preferred; **Round-Robin**: rotates starting source per query to balance load; **Random**: picks starting source randomly. All cascade on failure. |
| **Provider Order & Fallback** | Provider list | Drag handle (`⋮⋮`) | Reorders failover sequence; top item is the primary default provider. |
| **Multi-Key Pool** | Provider modal | Add/remove keys (masked) | In-flight key load balancing; routes to lowest `inFlight` key and fails over to secondary keys on 401 errors. |
| **Preference Presets** | Settings panel | Recommended / Fast / Deep / Economy / Custom | One-click application of native execution parameters across all providers (e.g. latency priority vs exhaustive retrieval). |
| **Provider Attempt Timeout** | Advanced settings | 1000ms – 60000ms (default 10s) | Per-attempt budget before aborting and triggering fallback to the next provider. |
| **Per-Session Search Mode** | Chat input row | Auto / Required | When **Required**, enforces at least one `web_search`/`web_fetch` call before the agent finalizes an answer. |
| **Proxy Configuration** | System / Env vars | `HTTP(S)_PROXY` / `NO_PROXY` | System and environment proxy support. Loopback and local targets (`localhost`, `127.0.0.1`, SearXNG) automatically bypass. |

## Quick Selection Guide

Exa is the default provider for new installations based on project P5 benchmark evaluation.

| Use Case | Recommended Provider | Notes |
| --- | --- | --- |
| Default / Technical Documentation | **Exa** | High semantic relevance, precise highlights |
| Low-Latency Agent Grounding | **Brave Search** (LLM Context) | Fast response with pre-extracted context |
| Deep Research & Structured Extract | **Tavily** / **Parallel** | Thorough discovery and deep page parsing |
| High-Quality Webpage Markdown Scraping | **Firecrawl** / **Jina** / **You.com** | Robust main content extraction |
| News & General Topics | **You.com** | Broad coverage and real-time freshness |
| Private Intranet / Keyless Setup | **SearXNG** | Zero external API keys, fully self-hosted |

## Routing & Resilience

### 1. Search Routing Policy

Choose how the runtime selects the initial search provider:
- **Ordered (Default)**: Always starts with the first configured provider in the list.
- **Round-Robin**: Rotates the initial provider sequentially per query to distribute request load across multiple providers.
- **Random**: Randomly selects a provider as the starting point.

> When the initial provider fails, the runtime always cascades through the remaining providers in order regardless of the routing policy.

### 2. Automatic Fallback Chain

Drag and drop providers in the settings page to customize the fallback order. Failover triggers on:
- Request timeouts (configurable per-attempt timeout, default 10s)
- Network errors or DNS lookup failures
- Upstream 5xx server errors
- 429 rate limits or exhausted credits (402, 432, 433)

### 3. 429 Retry-After Cooldown

When an upstream provider responds with HTTP 429 and a `Retry-After` header, it is placed in temporary cooldown. Subsequent queries skip this provider with zero network overhead until the cooldown expires.

### 4. Multi-Key Pooling & Isolation

Add multiple API keys to any hosted provider:
- Requests prioritize keys with the lowest active in-flight count.
- Authentication errors (401/403) mark that specific key unhealthy and immediately try alternative keys under the same provider before cascading to the next provider.
- Keys are masked in the UI to prevent credential exposure.

## Search Mode

The web interface includes a session-level Search Mode toggle beside the chat input:

- **Auto**: The agent autonomously decides whether to use web retrieval tools based on context.
- **Required**: Enforces at least one `web_search` or `web_fetch` call before finalizing a response. If web retrieval fails entirely, the agent is instructed to state what could not be verified.

<p align="center">
  <img src="assets/searchMode.png" width="480" alt="Search Mode Toggle" />
</p>

## Interactive Test Search

The settings page provides an integrated test console to verify the live fallback chain:
- Inspect the selected winning provider
- View end-to-end latency and result count
- Review detailed attempt logs (success, timeout, authentication failure, rate limit)
- Preview retrieved titles, URLs, and snippet excerpts

<p align="center">
  <img src="assets/overviewAndTestSearch.png" width="850" alt="Test Search" />
</p>

## Proxy Configuration

Built-in proxy resolution supports:

```text
HTTP_PROXY / HTTPS_PROXY
Windows System Proxy settings
NO_PROXY
```

Loopback addresses (`localhost`, `127.0.0.1`, `::1`, `*.local`) automatically bypass proxies.

## Security & Privacy

- **Local Storage & Direct Transport**: API keys remain in the local DSH credential vault. The host process communicates directly with provider endpoints without intermediate relays.
- **Masked Credentials**: Full API keys are never exposed back to the client UI. Authorization headers are sanitized in logs and test outputs.
- **Self-Hosting**: Supports air-gapped or private environments using a local SearXNG instance.

## Development

```bash
# Install dependencies
pnpm install

# Run test suite
pnpm test

# Type checking
pnpm run typecheck

# Build bundle
pnpm run build
```

> After making changes in `src/`, run `pnpm run build` to generate the `lib/` artifacts. Refer to [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## FAQ

<details>
<summary><b>Plugin still displays the old version after updating?</b></summary>

If upgrading via `file:` or package store encounters caching, run `pnpm install` in your DSH profile directory:

```bash
cd ~/.dsh/profiles/web
pnpm install
```

For local plugin development, use `link:` instead of `file:` to ensure immediate updates.
</details>

<details>
<summary><b>Why do some providers show "Dashboard only" for quota?</b></summary>

Certain providers (e.g., Exa, Parallel) do not currently expose a lightweight public balance endpoint for individual API keys. Quota display is an informational helper and does not affect search functionality or failover.
</details>

## License

[MIT](LICENSE) © A3Boy
