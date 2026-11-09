# Changelog

All notable changes to `dsh-web-tools` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Country Detection Accuracy**: Disambiguated 2-letter ISO country codes (`US`, `CN`, `JP`, `UK`, `GB`, `SG`, `DE`, `FR`, `CA`) from case-insensitive common words (e.g. "give us the latest React docs", "contact us"), preventing unintended geographic filtering.
- **Topic Classification Precision**: Replaced greedy first-match with a multi-signal scoring system, preventing queries like "bond issue 财报" from being misclassified as code searches.
- **Soft-Fail Search Fallback**: When a provider returns 0 results, the executor now treats it as a soft-fail and continues down the fallback chain to retrieve answers from subsequent healthy providers.
- **Content Quality Gate for Page Fetch**: Added length and bot challenge (Cloudflare, JS-walls) detection for native fetch adapters, triggering graceful fallback to secondary fetchers or built-in browser retrieval.
- **Key Pool Auto-Recovery TTL**: Added automatic 15-minute TTL recovery for keys marked unhealthy due to temporary auth/billing failures.
- **Fetch Metrics & Latency Tracking**: Unified attempt recording and statistics tracking between search and fetch executors.

### Changed
- Cleaned up repository root by archiving development screenshot scripts into `scripts/`.
- Synchronized package manager commands in `README.md` and `README.zh-CN.md` to match `package-lock.json` and CI workflows.
- `createQuotaPersistScheduler` is generic over the stored record type, so Brave snapshots and the Keenable ledger share the same coalesced settings writer.

---

## [0.4.0] - 2026-11-09

### Added
- **Serper (Google Search) Provider**:
  - Native integration with Serper API (`https://google.serper.dev/search`) using `X-API-KEY`.
  - SearchHints compiler maps queries, domain constraints (`site:` / `-site:`), geo country (`gl`), language (`hl`), and Google freshness filters (`tbs`).
  - Normalizes Google `answerBox` quick answers and organic search results.
  - Integrated with provider brand colors, icons, dashboard link, and multilingual copy.
- **Custom Provider One-Click Presets**:
  - Added one-click template loader in custom provider configuration modal.
  - Built-in presets for Serper (Google Search), SearXNG (Meta Search), Elasticsearch / OpenSearch (with multi-match query body template), and Tavily Compatible Gateways.
- **Long-Document Table of Contents (TOC) Outline**:
  - Built-in generic fetcher automatically analyzes markdown headings (`# H1`, `## H2`, `### H3`) for long documents exceeding 8,000 characters.
  - Prepends a structured Table of Contents outline to help LLMs navigate and ground long-form content.
- **Search Mode Keyboard Shortcut (`Alt+S`)**:
  - Added global shortcut `Alt+S` in the chat composer to cycle through Smart (`auto`), Always (`required`), and Off (`off`) search modes without leaving the keyboard.
  - Trigger button tooltip reflects shortcut hint (`Alt+S`).
- **Resilience & Circuit Breaker**:
  - Provider-level circuit breaker that pauses backends after 3 consecutive network/timeout/server failures for 30s.
  - Half-open state admits single probe requests with exponential backoff up to 5 minutes.
- **Short-Lived Result Cache & In-Flight Coalescing**:
  - In-memory result cache (60s for search, 5min for fetch) with in-flight request deduplication to save API quota on repeated queries.
  - Automatic invalidation on credential or configuration changes.

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
