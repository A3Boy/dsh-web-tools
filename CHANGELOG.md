# Changelog

All notable changes to `dsh-web-tools` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-11-13

### Added
- **Focused Page Reading (`web_read`)**:
  - Deterministic BM25 passage ranking and section outline extraction for web pages, returning only relevant excerpts and high-level structure instead of dumping entire pages into LLM context.
  - Section-level progressive reading via `section` parameter, reusing the 5-minute cached fetch provider and SSRF defense.
  - Page identity continuity verification via 8-character Sha256 `contentId`, preventing section drift if the target page content updates between turns.
  - Registered as a standard DSH host tool (`ctx.tools.register`) with full `output.schema` ValueSchemaSpec definition.
  - Integrated into Search Mode policy runtime: automatically gated and restricted alongside `web_search` and `web_fetch` when search mode is switched OFF.
  - Exposed as standard tool in standalone stdio MCP server (`dsh-web-tools-mcp`) with `readOnlyHint` and `openWorldHint` annotations.
  - Configurable `webReadEnabled` setting (default `true`) with English and Simplified Chinese localizations.

## [0.4.0] - 2026-11-09

### Added
- **Search Sorting & Filtering Across Surfaces**:
  - Added multi-criteria search sorting (`time`, `likes`, `comments`, `collects`) across SearchHints compiler, Xiaohongshu platform queries, and MCP server `web_search`.
  - Prioritized rich summaries over short snippets in MCP search output with direct answers surfaced upfront.
- **Multi-Source Concurrent Retrieval (Hedged & Fused)**:
  - **Hedged Search**: Starts a fallback provider in parallel when the primary provider stalls (>1.2s). The first responder completes the search, and the slower lane is automatically cancelled with `cancelled@<duration>ms` recorded in the diagnostic ledger.
  - **Fused Search (RRF)**: Queries two providers concurrently and merges both ranked lists using Reciprocal Rank Fusion with URL canonicalization and deduplication.
  - Test search results display a "Fused" badge and map combined `a+b` provider names.
- **Intelligent Routing Policies**:
  - Added **Adaptive** routing based on rolling 24-hour success rate and latency scoring.
  - Added **Fastest** (lowest average latency) and **Cheapest** (cost-tier dispatch: self-hosted SearXNG -> budget APIs -> metered deep extraction).
- **Standalone stdio MCP Server (`dsh-web-tools-mcp`)**:
  - Fully decoupled core retrieval engine from DSH runtime.
  - Exposes `web_search` and `web_fetch` over standard stdio MCP protocol (`2025-06-18`, `2025-03-26`, `2024-11-05`) for Cursor, Claude Code, Windsurf, and custom agents.
- **Serper (Google Search) Provider**:
  - Native integration with Serper API (`https://google.serper.dev/search`) using `X-API-KEY`.
  - SearchHints compiler maps queries, domain constraints (`site:` / `-site:`), geo country (`gl`), language (`hl`), and Google freshness filters (`tbs`).
  - Normalizes Google `answerBox` quick answers and organic search results.
- **Custom Provider One-Click Presets**:
  - Added one-click template loader in custom provider configuration modal.
  - Built-in presets for Serper (Google Search), SearXNG (Meta Search), Elasticsearch / OpenSearch (with multi-match query body template), and Tavily Compatible Gateways.
- **Long-Document Table of Contents (TOC) Outline**:
  - Built-in generic fetcher automatically analyzes Markdown headings for long documents exceeding 8,000 characters.
  - Prepends a structured Table of Contents outline to help LLMs navigate long context efficiently.
- **Search Mode Keyboard Shortcut (`Alt+S`)**:
  - Added global shortcut `Alt+S` in the chat composer to cycle through Smart (`auto`), Always (`required`), and Off (`off`) search modes without leaving the keyboard.
- **Resilience & Circuit Breaker**:
  - Provider-level circuit breaker that pauses backends after 3 consecutive network/timeout/server failures for 30s with exponential probe backoff up to 5 minutes.
  - Key pool health auto-recovery with a 15-minute TTL for temporary auth/billing failures.
  - Short-lived result cache (60s for search, 5min for fetch) with in-flight request deduplication.

### Fixed
- **Platform-Fallback Telemetry**: Forwarded `backend`, `attempts`, and `fused` diagnostic fields through `SpecializedSourceRegistry` on both normal and degraded-web fallback paths.
- **Hedged Loss Cancellation Diagnostics**: Losing lanes in hedged searches now explicitly record `cancelled` with elapsed duration in the attempts ledger rather than being silently dropped.
- **Country Detection Accuracy**: Disambiguated 2-letter ISO country codes from case-insensitive common words (e.g. "give us the latest React docs"), preventing unintended geographic filtering.
- **Topic Classification Precision**: Replaced greedy first-match with a multi-signal scoring system, preventing queries like "bond issue 财报" from being misclassified as code searches.
- **Soft-Fail Search Fallback**: When a provider returns 0 results, the executor treats it as a soft-fail and continues down the fallback chain to retrieve answers from subsequent healthy providers.
- **Content Quality Gate for Page Fetch**: Added length and bot challenge (Cloudflare, JS-walls) detection for native fetch adapters, triggering graceful fallback to secondary fetchers or built-in browser retrieval.

### Changed
- **Keenable Provider**:
  - Added native page content fetching support (`GET /v1/fetch`) with title, author, and date extraction (`fetchCapable: true`).
  - Added response header quota extraction for `x-ratelimit-limit`, `x-ratelimit-remaining`, and `x-ratelimit-reset`.
- **Dependency Upgrades**:
  - Upgraded `defuddle` to `^0.19.6` for enhanced local DOM markdown extraction.
  - Upgraded `linkedom` to `^0.18.15` for improved DOM performance and HTML parsing.
  - Upgraded `undici` to `^6.29.1` and `ws` to `^8.18.2` with security patches.

---

## [0.3.9] - 2026-11-07

### Added
- Keenable search provider adapter with date filtering (`published_after`, `published_before`) and domain scoping.

### Fixed
- Quota synchronization and key pooling diagnostics.

---

## [0.3.5] - 2026-11-01

### Added
- Custom search providers with 3 parallel access paths and SSRF defense.
- Native Xiaohongshu and Twitter / X browser session retrieval.
