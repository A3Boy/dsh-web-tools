<div align="center">

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/logo.png" alt="dsh-web-tools" width="160" />
</p>

# dsh-web-tools

Empower DeepSeek Harness with unified search and deep content extraction across the open web and social platforms.

**Native-Capability Adaptation Across 8 Web Providers · SearchHints Semantic Compilation · Multi-Source Resilience · Xiaohongshu & Twitter / X Retrieval**

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

When web access depends on a single provider, exhausted quota, rate limits, or timeouts can interrupt retrieval. Wrapping multiple APIs with a naive proxy often flattens them to a lowest common denominator, failing to leverage each provider's specialized search modes, categories, freshness, domain rules, and extraction capabilities.

dsh-web-tools connects Exa, Tavily, Firecrawl, Parallel, Brave, You.com, Jina, SearXNG, Xiaohongshu, and Twitter / X to DSH’s standard `web_search` / `web_fetch` interface.

While keeping the tool interface unified, dsh-web-tools normalizes search intents through SearchHints and compiles queries into native provider-specific parameters. This leverages each engine's native categories, freshness filters, domain policies, regional targeting, and content extraction, while maximizing uptime through multi-key allocation, automated failover, and dedicated browser profiles.

---

**Key Highlights**:

- **Native-Capability Adaptation Across 8 Web Providers**: Keeps the standard `web_search` / `web_fetch` contracts while compiling unified search intent into provider-specific native parameters instead of reducing every backend to the same lowest-common-denominator feature set.
- **SearchHints → Provider-Specific Parameter Compilation**: Normalizes technical, research, news, date, region, and domain constraints from queries, compiling them into provider-native parameters through deterministic code without additional LLM latency.
- **Xiaohongshu & Twitter / X Platform Sources**: Twitter / X supports native search and tweet extraction; Xiaohongshu supports native note details with default safe web discovery (native in-platform search available experimentally).
- **Multi-Source Scheduling & Resilience**: Features multi-API-key pooling, 401 failover, 429 cooldown windows, configurable Ordered / Round-Robin / Random routing, and failover chains.
- **Native DSH Tool Integration**: Plugs directly into standard `web_search` / `web_fetch` without requiring new tool declarations, and includes a session-level "Search Mode" toggle.

```text
                         DSH Agent
                            │
                 web_search / web_fetch
                            │
                            ▼
                       SearchHints
            topic / freshness / domains
               locale / cleanQuery ...
                            │
                 Provider-specific
                    compilation
                            │
      ┌────────┬─────────┬───────────┬──────────┐
      │  Exa   │ Tavily  │ Firecrawl │ Parallel │ ...
      │        │         │           │          │
      │category│ topic   │ github    │objective │
      │ date   │ chunks  │ research  │ policy   │
      │domains │ time    │ tbs       │ queries  │
      └────────┴─────────┴───────────┴──────────┘

```

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/searchOrderAndRouting.png" width="900" alt="dsh-web-tools search strategy and multi-provider routing" />
</p>

## Native-Capability Adaptation Across 8 Web Providers

The tool interface and search semantics are unified for the DSH agent, but underlying provider capabilities are not.

dsh-web-tools expresses query intent through SearchHints and crafts dedicated requests for each provider, rather than compressing all backends into a single set of lowest-common-denominator parameters.

For example, when searching for "AI coding references from the past week":

* **Exa**: Maps category filters, ISO date ranges, and domain constraints;
* **Firecrawl**: Maps technical queries to the native `github` category, research queries to `research`, and applies `tbs` freshness filters;
* **Parallel**: Deconstructs the query into `objective`, clean `search_queries`, and `source_policy`;
* **Brave Search**: Maps freshness, country, and language parameters with priority LLM Context endpoint;
* **You.com**: Leverages `boost_domains` for soft domain preference.

All adaptations run through deterministic code without invoking an extra LLM call.

* **Exa**: Category mapping (`publication` / `news` / `financial report`), ISO-8601 date ranges, and domain constraints.
* **Firecrawl**: Maps coding and technical queries to the `github` category, academic queries to `research`, and supports `tbs`, domain constraints, and clean Markdown extraction.
* **Parallel**: Dual-layer semantics (`objective` soft-steering + clean `search_queries`) and `source_policy` domain/freshness filters.
* **Tavily**: Supports `basic` / `advanced` / `fast` / `ultra-fast` search depths; `basic`, `advanced`, and `fast` support `chunks_per_source`, with native `news` / `finance` topics, date ranges, country, and domain constraints.
* **Brave Search**: LLM Context endpoint with `pd/pw/pm/py` freshness filters, country, and search language.
* **You.com**: Native **`boost_domains`** soft-weighting, freshness presets, and geo/language targeting.
* **Jina**: Query noise reduction and ReaderLM-v2 high-precision markdown extraction.
* **SearXNG**: Self-hosted metasearch with `categories` (it/science/news) and `time_range`.
* **Native Page Extraction (`web_fetch`)**: Transparently routes to provider-native scraping backends (Exa `/contents`, Tavily `/extract`, Firecrawl `/scrape`, Parallel `/v1/extract`, You.com `/v1/contents`, Jina Reader).

---

## Social Platform Sources

Unlike general search engines, the plugin connects directly to native social platform sessions:

* **Native Isolated Browser Architecture**:
  * Directly controls local Edge / Chrome instances using dedicated profiles over CDP.
  * **0 browser extensions and 0 Playwright / Chromium bundles**. Cookies remain managed by the dedicated browser profile and are not written to plugin configuration, logs, or relays; the browser still sends them to the platform during normal authenticated requests.

* **Xiaohongshu**:
  * **Note Detail Fetch (`web_fetch`)**: Headless extraction of structured `__INITIAL_STATE__` data with DOM fallback, preserving signed `xsec_token` URLs, note text, author information, and engagement metrics.
  * **Search Discovery (`web_search`)**: Defaults to general-web discovery (`site:xiaohongshu.com`); native in-platform search is experimental and can be enabled with `XHS_NATIVE_SEARCH=1`.

* **Twitter / X**:
  * **Native Search & Tweet Detail**: Captures the X web client's GraphQL data streams (SearchTimeline / TweetDetail) over CDP, parses them structurally, and uses DOM extraction as a supplement and fallback. Supports `from:`, `since:`, and `until:` operators.

* **General-Web Fallback**: Uses configured general search or fetch providers when a platform source is disabled, signed out, or fails. An aborted request does not continue through fallback.
* **Automated Session Verification**: Checks required cookies after login and re-checks persisted profiles during status requests and platform operations. An expired session still requires sign-in again.

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/platformSessions.png" width="900" alt="Xiaohongshu and Twitter X signed-in sessions verified automatically" />
</p>

---

## Fallback & Resilience

* **Multi-API-Key Pooling**: Assigns keys per provider, balances concurrent requests by lowest in-flight count, and fails over across keys on authentication errors.
* **Deterministic Provider Fallback**: Automatically cascades through the fallback chain on network failures, timeouts, 5xx server errors, 429 rate limits, or exhausted quotas.
* **429 Retry-After Cooldown**: Enforces zero-request cooldown windows when servers return `Retry-After` headers, skipping rate-limited providers immediately.
* **Configurable Routing Policies**: `web_search` supports Ordered, Round-Robin, and Random starting-provider selection. `web_fetch` always follows the deterministic fetch-capable chain.
* **Session-Level Search Mode**: Requires at least one completed `web_search` or `web_fetch` call before an answer. A failed call still counts as an attempt, and the agent is instructed to disclose what could not be verified.
* **Proxy Support**: Supports the Windows system proxy, `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY`, with automatic loopback bypass.

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
| [Tavily](https://tavily.com) | Yes | Yes, `/extract` | Search depths (`basic` / `advanced` / `fast` / `ultra-fast`); the first three support chunking, plus `news` / `finance`, date, country, and domain parameters | Official API |
| [Firecrawl](https://firecrawl.dev) | Yes | Yes, `/scrape` | Technical queries map to `github`, academic queries to `research`; supports `tbs`, domain constraints, and clean Markdown extraction | Official API |
| [Parallel](https://parallel.ai) | Yes | Yes, `/v1/extract` | Agent dual-layer semantic search (`advanced` / `basic` / `turbo`), `objective` soft-steering, `source_policy` | Dashboard only |
| [Brave Search](https://brave.com/search/api/) | Yes | — | Preferred LLM Context pre-extraction with `pd/pw/pm/py` freshness, country/lang filters, auto fallback to Classic Search | Response headers |
| [You.com](https://you.com) | Yes | Yes, `/v1/contents` | Snippet highlights, native **`boost_domains`** soft-weighting, freshness and country/lang filters, markdown endpoint | Official API |
| [Jina](https://jina.ai) | Yes | Yes, Reader | Search query noise filtering, ReaderLM-v2 high-precision markdown, token budget and truncation control | Best-effort |
| [SearXNG](https://docs.searxng.org) | Yes | — | Open-source self-hosted metasearch with `categories` and supported `time_range` values; the adapter requires no API key | Instance-defined |

### Quick Recommendation Guide

New installations default to **Exa**; existing installations keep their saved provider configuration.

| Scenario | Recommended Provider | Notes |
| --- | --- | --- |
| **Social Discovery & Content Detail** | **Xiaohongshu / Twitter / X** | X provides native search and detail retrieval; Xiaohongshu combines web discovery with native note-detail extraction |
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

Exa and Parallel balances are checked in their provider dashboards; Brave quota information comes from actual search response headers. Quota display is informational and does not affect routing or fallback.

Xiaohongshu and Twitter / X each use a dedicated local browser profile. The plugin does not export raw cookies to configuration, logs, or third-party relays; the browser sends them through normal authenticated requests to the corresponding platform domains.

---

## License

[MIT](LICENSE) © A3Boy
