<div align="center">

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/logo.png" alt="dsh-web-tools" width="160" />
</p>

# dsh-web-tools

**Next-Generation Multi-Source Web Search & High-Density Retrieval Engine for DeepSeek Harness and MCP Agents**

Native Deep Capabilities across 10 Search Engines · Hedged & Fused Concurrent Retrieval · Focused Page Reading (`web_read`) · Xiaohongshu & Twitter/X Sessions · Standalone Stdio MCP Server

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
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tests-670%2B%20Passing-brightgreen?style=flat-square" alt="Tests" />
</p>

**English** | [简体中文](README.zh-CN.md)

</div>

---

## Table of Contents

- [Release History](#release-history)
- [Why dsh-web-tools?](#why-dsh-web-tools)
- [Architecture Overview](#architecture-overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
  - [1. Inside DeepSeek Harness (DSH)](#1-inside-deepseek-harness-dsh)
  - [2. Standalone MCP Server (Cursor / Claude Code / Windsurf)](#2-standalone-mcp-server-cursor--claude-code--windsurf)
- [Focused Page Reading (`web_read`)](#focused-page-reading-web_read)
- [Multi-Source Concurrent Retrieval & Routing](#multi-source-concurrent-retrieval--routing)
- [Social Platform Sources (Xiaohongshu & Twitter / X)](#social-platform-sources-xiaohongshu--twitter--x)
- [Custom Search Providers & One-Click Presets](#custom-search-providers--one-click-presets)
- [Provider Support Matrix](#provider-support-matrix)
- [MCP Server Specification](#mcp-server-specification)
- [Frequently Asked Questions (FAQ)](#frequently-asked-questions-faq)
- [Local Development & Benchmarks](#local-development--benchmarks)
- [License](#license)

---

## Release History

| Version | Date | Highlights |
| :--- | :--- | :--- |
| **v0.5.0** | 2026-11-13 | • **Focused Page Reading (`web_read`)**: Deterministic BM25 passage ranking and section outline extraction; cuts token consumption by 85–95% while keeping 100% answer recall<br/>• **Progressive Drilling & Anti-Drift**: Multi-turn `section` reading with 8-char SHA-256 `contentId` drift protection<br/>• **M4 Real-Page Benchmark Suite**: Automated evaluation across 50 real-world technical and domain-specific cases<br/>• **Ecosystem**: Added `web_read` to standalone MCP server; integrated search mode gating (`off` isolation) |
| **v0.4.0** | 2026-11-09 | • **Concurrent Retrieval**: Added Hedged (speculative racing) and Fused (Reciprocal Rank Fusion - RRF) retrieval<br/>• **Intelligent Routing**: Adaptive (24h health/p95 latency), Fastest, and Cheapest (cost-tier) policies<br/>• **Standalone MCP Server**: Decoupled stdio MCP service for Cursor, Claude Code, and Windsurf<br/>• **Serper Adapter**: Native Google Search integration with `answerBox` normalization<br/>• **Long-Document TOC**: Automatic Table of Contents generation for documents > 8,000 characters |
| **v0.3.9** | 2026-11-07 | Integrated Keenable search with `site` domain scoping and date range filtering. |
| **v0.3.5** | 2026-11-01 | Custom search providers with 3 parallel access paths and SSRF defense; native Xiaohongshu and Twitter / X browser session retrieval. |

For detailed change logs, see [CHANGELOG.md](CHANGELOG.md).

---

## Why dsh-web-tools?

When building LLM agents, relying on simple search APIs introduces three major bottlenecks:

1. **Fragility & Single-Point Failure**: A single quota exhaustion, 429 rate limit, or transient network spike stops the entire agent workflow.
2. **Capability Flattening**: Traditional multi-search proxies flatten all providers into the lowest common denominator, discarding their unique strengths (e.g. Exa's neural categories, Brave's LLM Context, Tavily's chunking & depth, Firecrawl's GitHub filters, Keenable's summary extracts, Serper's Google AnswerBoxes).
3. **Context Window Bloat**: Standard `web_fetch` dumps entire 50k–200k character web pages directly into LLM context, wasting precious tokens, increasing inference cost, and causing the model to lose focus or hallucinate.
4. **Social Media Blind Spots**: General web engines cannot access authenticated content, discussion threads, or comments on platforms like Xiaohongshu or Twitter / X.

**dsh-web-tools solves this completely**:
- **3-in-1 Retrieval Tools**: Exposes `web_search` (multi-engine search), `web_fetch` (full-page extraction with auto TOC), and `web_read` (deterministic BM25 focused reading).
- **Zero-Latency SearchHints**: Compiles agent query intents (freshness, categories, code topics, domains, sorting) directly into provider-native parameters without additional LLM calls.
- **Enterprise Resilience**: Multi-API-key pooling, 429 backoff, circuit breakers, and Hedged / Fused concurrent retrieval.
- **Authentic Social Media Sessions**: Direct connections to Xiaohongshu and Twitter / X via dedicated local browser profiles—zero heavy Chromium downloads, zero extensions.

---

## Architecture Overview

```text
                        DSH Agent / Cursor / Claude Code / MCP Client
                                             │
                       ┌─────────────────────┼─────────────────────┐
                       ▼                     ▼                     ▼
                  web_search             web_read              web_fetch
                       │                     │                     │
                       ▼                     │                     │
                  SearchHints                │                     │
         (Freshness, Domain, Topic)          │                     │
                       │                     │                     │
       ┌───────────────┴───────────────┐     │                     │
       ▼                               ▼     │                     │
Web Providers (10 Adapters)     Social Platforms                   │
Exa / Tavily / Serper / ...     Xiaohongshu / X                    │
       │                               │                           │
 ┌─────┼─────┐                         ▼                           │
 ▼     ▼     ▼                  Local Browser                      ▼
Single Hedged Fused            (CDP Profile Mode)            Cloud Extractors
   │     │     │                       │                   (Exa/Tavily/Firecrawl)
   └─────┼─────┘                       │                           │
         ▼                             │                 Fallback: Defuddle
  Normalized Results                   │              + Auto TOC (>8k chars)
         │                             │                           │
         └─────────────────────────────┼───────────────────────────┘
                                       ▼
                       High-Density Markdown Context
```

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/searchOrderAndRouting.png" width="900" alt="dsh-web-tools search strategy and multi-provider routing" />
</p>

---

## Key Features

- **10 Deeply Adapted Search Providers**: Native parameter compilation for **Exa**, **Tavily**, **Serper (Google)**, **Brave**, **Firecrawl**, **Keenable**, **You.com**, **Jina**, **Parallel**, and **SearXNG**.
- **Concurrent Retrieval Modes**:
  - **Single**: Sequential fallback, lowest quota consumption.
  - **Hedged**: Speculatively triggers a secondary provider if the primary exceeds 1.2s; the first responder wins and aborts the rival, eliminating tail latency with zero quota waste on fast queries.
  - **Fused**: Queries two providers in parallel and merges results using Reciprocal Rank Fusion (RRF) for high-recall scenarios.
- **6 Intelligent Routing Policies**: **Ordered**, **Round-Robin**, **Random**, plus metrics-driven **Adaptive** (rolling 24h success rate & p95 latency), **Fastest**, and **Cheapest** (cost-tier prioritization).
- **Focused Page Reading (`web_read`)**: Deterministic BM25 passage ranking across Markdown chunks. Returns only the most relevant excerpts and a full section outline within a strict character budget, with multi-turn `section` reading and `contentId` anti-drift protection.
- **Social Media Deep Extraction (Xiaohongshu & Twitter / X)**: Connects via dedicated local system browser profiles (Edge/Chrome) without extra Chromium downloads or extensions. Extracts verified notes, images, metrics, and nested reply trees.
- **Long-Document TOC Outlines**: Automatically parses Markdown headings for documents exceeding 8,000 characters and prepends an interactive Table of Contents outline to help models navigate long context.
- **Custom Search Providers & One-Click Presets**: Declarative integration for internal knowledge bases or custom REST APIs, with ready-to-use presets for Serper, SearXNG, Elasticsearch / OpenSearch, and Tavily-compatible gateways.
- **Enterprise-Grade Outbound Protection (SSRF Defense)**: Safe public egress, explicit confirmation prompts for private networks, and transport-level hard blocking of cloud metadata (169.254 / IMDSv6) and link-local ranges.
- **Multi-Level Fault Tolerance**: Multi-API-key pooling, 429 cooldown windows, circuit breakers, short-lived result caching (60s search, 5min fetch), and in-flight request deduplication.
- **Standalone MCP Server**: Standard stdio MCP protocol (`2025-06-18`, `2025-03-26`, `2024-11-05`) compatible with Cursor, Claude Code, Windsurf, Claude Desktop, and custom agents.

---

## Quick Start

### 1. Inside DeepSeek Harness (DSH)

#### Installation

Run inside your DSH environment:

```bash
# Install plugin
dsh plugin --profile web add github:A3Boy/dsh-web-tools

# Upgrade plugin
dsh plugin --profile web update dsh-web-tools
```

#### Configuration

Restart DSH Web (`dsh web`), and navigate to **Settings** → **Web Search** in the left sidebar:

1. Enter API keys for your search providers (e.g., Tavily, Exa, Serper, Brave; self-hosted SearXNG requires no key).
2. Enable your desired providers and drag to reorder the fallback sequence.
3. Click **Test Search** under any provider to verify network connectivity and response latency.

#### In-Chat Usage

- **Search Mode Shortcut**: Press `Alt+S` in the chat input box to cycle through **Smart** (auto), **Always** (enforced search), and **Off** (hard network isolation).
- **Social Platform Search**: Prefix queries with `小红书:` or `X:` (e.g. `小红书: 杭州西湖小众喝茶路线` or `X: DeepSeek Harness architecture discussions`) to route to dedicated social platform sessions.

---

### 2. Standalone MCP Server (Cursor / Claude Code / Windsurf)

You can run `dsh-web-tools` independently outside DSH as a standard stdio Model Context Protocol (MCP) tool server.

#### Option A: Run via npx / global binary

```bash
# Global install
npm install -g dsh-web-tools

# Run standalone server
dsh-web-tools-mcp
```

#### Option B: Run from source repository

```bash
git clone https://github.com/A3Boy/dsh-web-tools.git
cd dsh-web-tools
npm install && npm run build
node bin/mcp-server.js
```

#### Configuration Examples for MCP Clients

##### Cursor (`.cursor/mcp.json` or Global Cursor Settings)

```json
{
  "mcpServers": {
    "web-tools": {
      "command": "dsh-web-tools-mcp",
      "env": {
        "EXA_API_KEY": "your-exa-key",
        "TAVILY_API_KEY": "your-tavily-key",
        "SERPER_API_KEY": "your-serper-key",
        "BRAVE_API_KEY": "your-brave-key",
        "WEB_TOOLS_ROUTING_POLICY": "adaptive",
        "WEB_TOOLS_RETRIEVAL_STRATEGY": "hedged"
      }
    }
  }
}
```

##### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "dsh-web-tools": {
      "command": "node",
      "args": ["/path/to/dsh-web-tools/bin/mcp-server.js"],
      "env": {
        "TAVILY_API_KEY": "tvly-...",
        "EXA_API_KEY": "...",
        "WEB_TOOLS_DEFAULT_PROVIDER": "tavily"
      }
    }
  }
}
```

##### Claude Code CLI

```bash
claude mcp add web-tools -- dsh-web-tools-mcp
```

---

## Focused Page Reading (`web_read`)

### The Problem: Context Window Bloat

When researching topics, agents typically call `web_fetch` to retrieve article contents. Full web pages often contain 20,000 to 200,000 characters of text, navigation boilerplate, references, and tangential sections. Draining thousands of tokens on irrelevant text causes:
- Context saturation and early truncation.
- "Lost in the Middle" syndrome and severe retrieval hallucinations.
- Unnecessary inference costs and high response latency.

### The Solution: Deterministic BM25 Reading

`web_read` uses an efficient, pure algorithmic pipeline:
1. **Document Chunking**: Parses Markdown into structural sections, respecting code blocks, lists, and headings.
2. **Deterministic BM25 Scoring**: Ranks chunks against the user's `focus` query using CJK bigrams and Latin tokens—no extra LLM calls, zero added model latency.
3. **Budgeted Selection**: Returns the document lead paragraph, the top-ranking passages, and a complete structural **Table of Contents (TOC) Outline** within a strict character budget (default: 6,000 chars).
4. **Progressive Drilling (`section`)**: The agent inspects the outline and can drill into any specific section by passing `section: "<id>"` (e.g. `section: "s3"`).
5. **Anti-Drift Protection (`contentId`)**: Each read returns an 8-character SHA-256 fingerprint (`contentId`). If a live page updates between turns, passing `contentId` immediately detects content shifts and alerts the model to fetch a fresh outline instead of reading misaligned text.

### Progressive Reading Workflow

```text
Turn 1: web_read(url, focus: "WAL mode checkpointing")
  ├── High-relevance excerpt from Section 3
  └── Outline: [s1: Overview, s2: File Format, s3: Write-Ahead Logging, s4: Recovery]

Turn 2: web_read(url, section: "s3", contentId: "e7a1b4c9")
  └── Full content of Section 3 (Write-Ahead Logging)
```

### Tool Parameters

| Parameter | Type | Required | Description |
| :--- | :---: | :---: | :--- |
| `url` | string | **Yes** | Web page URL (`http://` or `https://`). |
| `focus` | string | No | Specific question or keywords to rank passages. If omitted, reads sequentially from the top. |
| `maxChars` | number | No | Character budget (500–20,000, default: 6,000). |
| `section` | string | No | Section id from a previous outline (e.g. `"s3"`) to read that section in full. |
| `contentId` | string | No | Content fingerprint from a previous turn to guarantee section continuity. |

### Real-World Evaluation Benchmark (M4)

Evaluated against 50 diverse real-world technical documentation pages:

| Metric | Result | Impact |
| :--- | :---: | :--- |
| **Token Reduction** | **85.0% – 95.0%** | Massive token savings on long documentation pages |
| **Answer Fact Recall** | **100%** | All key facts preserved in returned excerpts |
| **Target Section Discovery** | **100%** | Relevant sections identified accurately in outline |
| **Pipeline Latency** | **~2.1 ms** (P95: 9.4 ms) | Pure local computation, zero LLM overhead |

---

## Multi-Source Concurrent Retrieval & Routing

### 1. Concurrent Retrieval Modes

Configure how providers are queried under **Settings** → **Web Search**:

- **Single (Default)**: Tries providers sequentially. If the primary fails, times out, hits 429, or returns 0 results, it cascades to the next healthy provider. Lowest API consumption.
- **Hedged**: Dispatches to the primary provider. If no response arrives within 1.2s, a secondary provider starts concurrently. Whichever settles first wins; the slower lane is immediately aborted. Preserves fast response times without wasting quota on swift queries.
- **Fused**: Queries two providers in parallel and merges their ranked lists using **Reciprocal Rank Fusion (RRF)** with URL deduplication. Displays a "Fused" badge on combined results.

### 2. 6 Starting Routing Policies

- **Ordered**: Always begins with the primary provider in your configured chain.
- **Round-Robin**: Rotates starting providers evenly across requests.
- **Random**: Randomly selects an enabled, healthy provider.
- **Adaptive**: Dynamically ranks providers based on a 24-hour rolling window of success rate and p95 latency.
- **Fastest**: Prioritizes providers with the lowest average response latency.
- **Cheapest**: Dispatches by cost tier (self-hosted SearXNG -> low-cost APIs -> metered deep extraction).

### 3. SearchHints Intent Compiler

`SearchHints` extracts query intent deterministically without LLM latency:
- **Freshness**: Detects `2026`, `latest`, `recent`, `this week` -> compiles to Google `tbs: "qdr:y"`, Brave `freshness: "pw"`, Exa `start_published_date`.
- **Domain Scoping**: `site:github.com` or `-site:csdn.net` -> compiles to provider-native domain filter arrays (`includeDomains` / `excludeDomains`).
- **Topic Categories**: Automatically maps `research`, `paper`, `financial report`, `coding` to specialized neural categories (e.g. Exa category `research`, Firecrawl `github`).
- **Sorting**: Queries like "sort by time" or "most likes" compile directly to `sortBy: "time"` or `sortBy: "likes"`.

---

## Social Platform Sources (Xiaohongshu & Twitter / X)

Unlike scraper relays that get blocked or leak credentials, `dsh-web-tools` uses an **isolated local browser profile architecture**:

- **Zero Bloat**: Connects directly to the existing Chrome or Edge browser installed on your operating system via Chrome DevTools Protocol (CDP). Zero extra Chromium downloads, zero extensions.
- **Secure Local Sessions**: Cookies and session storage reside entirely in an isolated local directory (`~/.deepseek-harness/browser-data/`). Credentials never touch third-party servers.
- **Deep Structured Parsing**:
  - **Xiaohongshu**: Navigates authentic search views, parses note content, cover images, like/collect/reply counts, and complete multi-level nested comment trees.
  - **Twitter / X**: Captures native GraphQL responses, accurately reconstructing tweets, media attachments, quote tweets, and conversation reply threads.

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/platformSessions.png" width="900" alt="Xiaohongshu and Twitter X signed-in sessions verified automatically" />
</p>

---

## Custom Search Providers & One-Click Presets

Need to search an in-house knowledge base, an Elasticsearch cluster, or an internal search gateway? `dsh-web-tools` provides declarative custom provider support with built-in one-click presets:

1. **Serper (Google)**: Native REST integration for real-time Google search results and answer boxes.
2. **SearXNG**: Open-source meta-search engine integration.
3. **Elasticsearch / OpenSearch**: Pre-configured JSON request body template with `multi_match` query and configurable field weightings.
4. **Tavily Compatible Gateways**: Universal proxy compatibility.

All custom providers benefit from:
- Multi-API-key rotation and health tracking.
- Transport-level SSRF defense (blocking 169.254.169.254 and link-local addresses).
- Configurable response JSON pointer mappings (`itemsPath`, `titlePath`, `urlPath`, `snippetPath`).

---

## Provider Support Matrix

| Provider | Search | Fetch / Extract | Specialized Native Capabilities | Quota Tracking |
| :--- | :---: | :---: | :--- | :--- |
| **[Exa](https://exa.ai)** | Yes | Yes | Neural semantic search, category mapping, query highlights, ISO date & domain scoping | Provider console |
| **[Tavily](https://tavily.com)** | Yes | Yes | Depth levels, chunking control, news/finance topic mapping, geo & domain filters | Real-time API check |
| **[Serper](https://serper.dev)** | Yes | — | Real-time Google Search, `answerBox` quick answers, `tbs` freshness, geo & language targeting | Provider console |
| **[Firecrawl](https://firecrawl.dev)** | Yes | Yes | Coding queries mapped to `github`, research to `research`, clean Markdown extraction | Real-time API check |
| **[Parallel](https://parallel.ai)** | Yes | Yes | Dual-layer semantic search, `objective` soft-steering, `source_policy` filters | Provider console |
| **[Brave](https://brave.com/search/api/)** | Yes | — | Priority LLM Context pre-extracted summaries, freshness & regional filters | Header inspection |
| **[Keenable](https://keenable.ai)** | Yes | Yes | `site` domain scoping and date range filters; native page extraction (`/v1/fetch`) | Header & local usage ledger |
| **[You.com](https://you.com)** | Yes | Yes | Search highlights, native `boost_domains` soft-weighting, freshness & country filters | Real-time API check |
| **[Jina](https://jina.ai)** | Yes | Yes | Query noise reduction, ReaderLM-v2 high-precision Markdown conversion | Header inspection |
| **[SearXNG](https://docs.searxng.org)** | Yes | — | Self-hosted meta-search, category & time-range filters, keyless access | Self-hosted instance |

> **Page Fetching Note**: When a provider supporting extraction (Tavily, Exa, Firecrawl, Keenable) is configured, its cloud API is used first. If unconfigured or failing, requests seamlessly fall back to the **built-in generic fetcher** (powered by local Defuddle Markdown parsing with automatic TOC outline for long articles).

---

## MCP Server Specification

### Tools Exposed

1. **`web_search`**: Multi-engine search with automated fallback and SearchHints intent compilation.
   - `query` (string, required)
   - `maxResults` (number, optional, 1–20, default: 5)
   - `sortBy` (string, optional: `"relevance"` | `"time"` | `"likes"` | `"comments"` | `"collects"`)
2. **`web_fetch`**: Full-page content extraction with clean Markdown output and long-document TOC.
   - `url` (string, required)
3. **`web_read`**: Deterministic BM25 focused reading with structural outline and progressive continuation.
   - `url` (string, required)
   - `focus` (string, optional)
   - `maxChars` (number, optional, 500–20,000, default: 6,000)
   - `section` (string, optional)
   - `contentId` (string, optional)

### Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `EXA_API_KEY` | Exa Search API Key | — |
| `TAVILY_API_KEY` | Tavily Search API Key | — |
| `SERPER_API_KEY` | Serper (Google) API Key | — |
| `BRAVE_API_KEY` | Brave Search API Key | — |
| `FIRECRAWL_API_KEY` | Firecrawl API Key | — |
| `KEENABLE_API_KEY` | Keenable API Key | — |
| `YOU_API_KEY` | You.com API Key | — |
| `JINA_API_KEY` | Jina Reader/Search API Key | — |
| `PARALLEL_API_KEY` | Parallel AI API Key | — |
| `SEARXNG_URL` | Base URL for self-hosted SearXNG | — |
| `WEB_TOOLS_DEFAULT_PROVIDER` | Initial default provider | `exa` |
| `WEB_TOOLS_ROUTING_POLICY` | Routing policy (`ordered`, `round-robin`, `random`, `adaptive`, `fastest`, `cheapest`) | `adaptive` |
| `WEB_TOOLS_RETRIEVAL_STRATEGY` | Retrieval mode (`single`, `hedged`, `fused`) | `hedged` |
| `WEB_TOOLS_TIMEOUT_MS` | Per-provider attempt timeout in ms | `10000` |

---

## Frequently Asked Questions (FAQ)

### 1. SearXNG returns 403 or empty results?
Ensure JSON format output is enabled in your SearXNG instance:
- Edit `settings.yml` inside your SearXNG container and add `- json` under `search.formats`:
  ```yaml
  search:
    formats:
      - html
      - json  # Must be enabled for API consumption
  ```
- Restart the container. In the settings panel, fill in the instance address (e.g. `http://127.0.0.1:8080`) and leave the API Key blank.

### 2. Does multi-source search consume extra quota?
- **Single**: Only consumes 1 request per query (cascades only on failure or 0 results).
- **Hedged**: If the primary source responds within 1.2s, the secondary source is never called. If invoked, the winning lane aborts the loser immediately to minimize waste.
- **Fused**: Queries two providers simultaneously to merge and re-rank results, consuming two requests.

### 3. What does `WEB_READ_PAGE_CHANGED` mean?
If a web page updates its live content while an agent is reading multiple sections, the section offsets might change. Passing `contentId` detects this drift and throws `WEB_READ_PAGE_CHANGED`, prompting the agent to request a fresh outline instead of citing out-of-date sections.

### 4. A custom HTTPS source reports `unapproved authority <host>:0`?
This is a transport bug in affected versions: Undici's empty default-port value was interpreted as port 0. Adding `:443` to the URL does not work around it because URL normalization removes default ports. Install a version containing the default-port fix and restart the host; changing your API key or weakening outbound permissions is unnecessary for this error.

### 5. Does Auto mode append its web-search criterion every turn?
The criterion is now appended once per agent lifetime while Auto remains active, and again when returning from Required or Off mode. Required mode still adds its instruction each turn because that turn must complete a web tool call.

---

## Local Development & Benchmarks

```bash
# Install dependencies
npm install

# Run full test suite (670+ unit and integration tests)
npm test

# Type checking
npm run typecheck

# Build to lib/
npm run build

# Run web_read M4 real-world benchmark
npm run bench:m4
```

---

## License

[MIT](LICENSE) © [A3Boy](https://github.com/A3Boy)
