<div align="center">

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/logo.png" alt="dsh-web-tools" width="160" />
</p>

# dsh-web-tools

Empower DeepSeek Harness with unified search and deep content extraction across the open web and social platforms.

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

## What problem does it solve?

When web access depends on a single provider, exhausted quota, rate limits, or timeouts can interrupt retrieval. General search engines also have limited access to Xiaohongshu and Twitter / X discovery and detail pages.

dsh-web-tools connects 8 general-web providers and two platform sources to DSH’s standard `web_search` and `web_fetch` tools, adding configurable fallback, multi-key allocation, and dedicated browser profiles for more resilient retrieval and social-content extraction.

---

**Key Highlights**:
- **Xiaohongshu and Twitter / X Sources**: Twitter / X supports native search and detail extraction. Xiaohongshu supports native note detail extraction; search defaults to general-web discovery unless the experimental native-search flag is enabled.
- **Multi-Provider Aggregation and Fallback**: Includes 8 web providers with multi-key allocation, authentication failover, and a configurable fallback chain.
- **Deterministic SearchHints**: Extracts technical, research, freshness, and domain constraints in code and maps them to provider parameters without an additional LLM call.
- **Standard DSH Tool Integration**: Registers providers behind `web_search` and `web_fetch` and offers a per-session “web attempt required” mode.

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/searchOrderAndRouting.png" width="900" alt="dsh-web-tools settings and multi-provider routing" />
</p>

## Social Platform Sources

Unlike general search engines, the plugin connects directly to native social platform sessions:

- **Native Isolated Browser Architecture**:
  - Directly controls local Edge/Chrome instances using dedicated profiles via CDP.
  - **0 browser extensions and 0 Playwright/Chromium bundles**. Cookies are managed by the dedicated browser profile and are not written to plugin configuration, logs, or relays; the browser still sends them to the platform during normal authenticated requests.
- **Xiaohongshu**:
  - **Note Detail Fetch (`web_fetch`)**: Headless browser extraction of structured `__INITIAL_STATE__` with DOM fallback, preserving signed `xsec_token` URLs, full markdown text, author info, and engagement metrics.
  - **Search Discovery (`web_search`)**: Defaults to safe general-web discovery (`site:xiaohongshu.com`); native in-platform search is experimental (enabled via `XHS_NATIVE_SEARCH=1`).
- **Twitter / X**:
  - **Native Search & Tweet Detail**: Directly captures GraphQL network streams (SearchTimeline / TweetDetail) over CDP, supplementing thin responses with DOM extraction, supporting `from:`, `since:`, and `until:` operators.
- **General-Web Fallback**: Uses configured general search or fetch providers when a platform source is disabled, signed out, or fails. An aborted request does not continue through fallback.
- **Automated Session Verification**: Checks the required cookies after login and re-checks persisted profiles during status requests and platform operations. An expired session still requires sign-in again.

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/platformSessions.png" width="900" alt="Xiaohongshu and Twitter X signed-in sessions verified automatically" />
</p>

---

## Web Search Providers & Extraction

- **SearchHints Intent Mapping**: Extracts technical, research, freshness, and domain constraints in code and maps them to provider parameters without an additional LLM call.
- **8 Deeply Adapted Search Providers**:
  - **Exa**: Category mapping (`publication` / `news` / `financial report`), ISO-8601 date ranges, and domain constraints.
  - **Firecrawl**: Coding/technical queries query the **Developer Index** (`categories: ["developer"]`), supporting `research` and `tbs` time filters.
  - **Parallel**: Dual-layer semantics (`objective` soft-steering + clean `search_queries`) and `source_policy` domain/freshness filters.
  - **Tavily**: Full-tier `chunks_per_source` chunking control, `news` topic, and time range filtering.
  - **Brave Search**: LLM Context endpoint with `pd/pw/pm/py` freshness filters, country, and search language.
  - **You.com**: Native **`boost_domains`** soft-weighting, freshness presets, and geo/language targeting.
  - **Jina**: Query noise reduction and ReaderLM-v2 high-precision markdown extraction.
  - **SearXNG**: Self-hosted metasearch with `categories` (it/science/news) and `time_range`; the adapter does not require a provider API key.
- **Native Page Extraction (`web_fetch`)**: Transparently routes to provider-native scraping backends (Exa `/contents`, Tavily `/extract`, Firecrawl `/scrape`, Parallel `/v1/extract`, You.com `/v1/contents`, Jina Reader).

---

## Fallback & Resilience

- **Multi-API-Key Pooling**: Assigns keys per provider, balances concurrent requests by lowest in-flight count, and fails over across keys on authentication errors.
- **Deterministic Provider Fallback**: Automatically cascades through the fallback chain on network failures, timeouts, 5xx server errors, 429 rate limits, or exhausted quotas.
- **429 Retry-After Cooldown**: Enforces zero-request cooldown windows when servers return `Retry-After` headers, skipping rate-limited providers immediately.
- **Configurable Routing Policies**: `web_search` supports Ordered, Round-Robin, and Random starting-provider selection. `web_fetch` always follows the deterministic fetch-capable chain.
- **Session-Level Search Mode**: Requires at least one completed `web_search` or `web_fetch` call before an answer. A failed call still counts as an attempt, and the agent is instructed to disclose what could not be verified.
- **Proxy Support**: Supports the Windows system proxy, `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY`, with automatic loopback bypass.

---

## Installation & Updates

```bash
# Install
dsh plugin --profile web add github:A3Boy/dsh-web-tools

# Update
dsh plugin --profile web update dsh-web-tools

# Remove
dsh plugin --profile web remove dsh-web-tools

```

Restart `dsh web` and navigate to `Settings` → `Web Search`.

---

## Provider Capabilities

| Provider | Search | Fetch / Extract | Key Integrations & Adaptations | Quota Inspection |
| --- | --- | --- | --- | --- |
| [Exa](https://exa.ai) | Yes | Yes, `/contents` | Semantic retrieval (`auto` / `fast` / `deep`), `category` mappings, query-aware highlights, ISO-8601 date ranges | Dashboard only |
| [Tavily](https://tavily.com) | Yes | Yes, `/extract` | Deep search (`basic` / `advanced` / `fast` / `ultra-fast`), full chunking control, `news` topic & date filters | Official API |
| [Firecrawl](https://firecrawl.dev) | Yes | Yes, `/scrape` | Structured search, Developer Index for code, `research` category, `tbs` filter, clean markdown extraction | Official API |
| [Parallel](https://parallel.ai) | Yes | Yes, `/v1/extract` | Agent dual-layer semantic search (`advanced` / `basic` / `turbo`), `objective` soft-steering, `source_policy` | Dashboard only |
| [Brave Search](https://brave.com/search/api/) | Yes | — | Preferred LLM Context pre-extraction with `pd/pw/pm/py` freshness, country/lang filters, auto fallback to Classic Search | Response headers |
| [You.com](https://you.com) | Yes | Yes, `/v1/contents` | Snippet highlights, native **`boost_domains`** soft-weighting, freshness and country/lang filters, markdown endpoint | Official API |
| [Jina](https://jina.ai) | Yes | Yes, Reader | Search query noise filtering, ReaderLM-v2 high-precision markdown, token budget and truncation control | Best-effort |
| [SearXNG](https://docs.searxng.org) | Yes | — | Self-hosted metasearch with `categories` and `time_range`; the adapter requires no provider API key | Self-hosted; no platform quota |

### Quick Recommendation Guide

New installations default to **Exa**; existing installations keep their saved configuration.

| Scenario | Recommended Provider | Notes |
| --- | --- | --- |
| **Social Content and Detail Pages** | **Xiaohongshu / Twitter / X** | X supports author/date operators; detail results can include author and engagement data |
| **Semantic Search / Technical Documentation** | **Exa** | Semantic modes plus category, date, domain, and highlight parameters |
| **Pre-Extracted Search Context** | **Brave Search** | Prefers LLM Context with Classic Search fallback |
| **Configurable Search Depth and Extraction** | **Tavily** / **Parallel** | Provider-native depth modes and content extraction endpoints |
| **Content-to-Markdown Extraction** | **Firecrawl** / **Jina** | Main-content filtering, scraping, and Reader conversion |
| **Freshness, Region, and Domain Preference** | **You.com** | Freshness, locale, and `boost_domains` parameters |
| **Self-Hosted Metasearch** | **SearXNG** | Uses your SearXNG endpoint; the adapter requires no API key |

---

## Local Development

```bash
pnpm install          # Install dependencies
pnpm test             # Run test suite
pnpm run typecheck    # Type checking
pnpm run build        # Build bundle into lib/

```

---

## Frequently Asked Questions

If cache issues occur after upgrading via local path or symlinks, reinstall from the profile directory:

```bash
cd ~/.dsh/profiles/web && pnpm install

```

Exa and Parallel balances are checked in their provider dashboards; Brave quota information comes from real search response headers. Quota display is informational and does not affect routing or fallback.

Xiaohongshu and Twitter / X each use a dedicated local browser profile. The plugin does not export raw cookies to configuration, logs, or third-party relays; the browser sends them only through normal authenticated requests to the corresponding platform domains.

---

## License

[MIT](LICENSE) © A3Boy
