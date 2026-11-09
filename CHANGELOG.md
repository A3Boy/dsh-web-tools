# Changelog

All notable changes to `dsh-web-tools` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Keenable Usage Accounting**:
  - Parses the per-call `usage` object (`sku`, `credits`, `paid`) that billed `/v1/search` and `/v1/fetch` responses return, and accumulates it per key into a persisted monthly ledger (`keenableUsageCache`).
  - Optional console balance: reads `GET https://api.keenable.ai/bff/organization/balance` with a Supabase session from `KEENABLE_REFRESH_TOKEN` (auto-refreshed) or `KEENABLE_SESSION_TOKEN`. The route is undocumented, so every failure falls back silently to the local ledger.
  - The quota card now shows "credits used" for the current UTC month when no console session is configured.
- **Pool Merge Dedupes Organization Balances**: `QuotaSnapshot.group` lets a key pool count one organization-level balance once instead of once per API key.

### Changed
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
