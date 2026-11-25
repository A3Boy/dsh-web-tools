# Changelog

**English** | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to `dsh-web-tools` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-11-25

### Fixed
- **Cordis Activation Crash Hotfix (`cannot get property "tools" without inject`)**:
  - Remove synchronous `ctx.tools` property reads from `apply(ctx)` and rely strictly on optional `ctx.inject(["tools"], ...)` (with unload cleanup), fixing the plugin activation failure introduced when `"tools"` was moved out of static `inject` in `v0.5.1`.
  - Resolve optional `tools` via `ctx.get("tools")` in `registerWebRead` and `agent.ctx.get("tools")` in `installSearchModeRuntime` (`SessionController` does not inject `"tools"` on `agent.ctx`).
  - Filter `tools.restrict({ deny })` against `tools.view(agent).restrictableNames` when Search Mode is `off` so disabling `web_read` never causes `dsh-tools` to throw on an unregistered global tool name.

## [0.5.1] - 2026-11-25

> **Account Risk Notice**: Xiaohongshu search operates your signed-in browser window directly; frequent automated searches or pagination may trigger platform rate limits or account bans. Use a secondary account and keep query frequency low. Twitter / X is similarly subject to per-account rate limits.

### Fixed
- **Transport & Custom Providers (#18)**:
  - Normalize IPv6 bracketed hostnames (`[::1]`) and case in `createPinnedDispatcher`, `policyForCustomSource`, and `testSource` so IPv6 custom sources are not misclassified as unapproved authorities.
  - Omit IP literals from TLS SNI `servername` per RFC 6066 to avoid Node TLS `DEP0123` warnings and strict handshake rejections.
  - Honor `NO_PROXY` / `no_proxy` for custom search providers, and fall through to an authorized proxy dispatcher when local DNS cannot resolve a public custom endpoint.
  - Bypass ambient system proxies when dialing authorized LAN/private overrides for built-in providers.
- **Search Mode Policy Lifecycle (#17)**:
  - Guard `agent.session?.deriveMessages?.()` safely with an in-memory per-agent fallback so older DSH hosts without `deriveMessages` never throw in `agent/pre-step`.
  - Deduplicate consecutive `off`-mode notices from effective session history (restoring after compaction), matching `auto`-mode behavior.
  - Restore a session's last committed mode (`auto` / `required` / `off`) from session history across agent disposal and host restarts, immediately re-applying tool restrictions when resuming an `off` session.
- **`web_read` Lifecycle & Settings Wiring**:
  - Load `@deepseek-ai/dsh-tools` optionally at runtime and remove `"tools"` from hard Cordis `inject` dependencies so older DSH hosts still mount `web_search` and `web_fetch`.
  - Wire `webReadEnabled` end-to-end across `/web-tools/api/config`, the Settings UI switch, `onMounted()` boot sync, and live config updates without requiring a restart.
- **Social Platform & UI Polish**:
  - Allow signed-in `XSource.fetch` to fall back to public syndication / FxTwitter channels when the browser tab hits a temporary block/error page, and check caller abort immediately after session verification.
  - Display the Xiaohongshu / X account risk warning directly in the Settings UI under Platform Search Sources, add one-click custom presets for Zhipu BigModel and Bocha Web Search, and complete zh/en dictionary parity.

## [0.5.0] - 2026-11-24

### Fixed
- Validate default ports and protocol together for pinned custom-provider connections (#18).
- Reuse Auto-mode guidance from effective session history; restore it after compaction and avoid duplicates after session resume (#17).
- Reject mismatched tweet identities before serving public fallback content or merging engagement metadata; preserve caller cancellation and bound public upstream calls.

### Added
- **Focused Page Reading (`web_read`)**:
  - Deterministic BM25 passage ranking and section outline extraction for web pages, returning only relevant excerpts and high-level structure instead of dumping entire pages into LLM context.
  - Section-level progressive reading via `section` parameter, reusing the 5-minute cached fetch provider and SSRF defense.
  - Page identity continuity verification via 8-character Sha256 `contentId`, preventing section drift if the target page content updates between turns.
  - Registered as a standard DSH host tool (`ctx.tools.register`) with full `output.schema` ValueSchemaSpec definition.
  - Integrated into Search Mode policy runtime: automatically gated and restricted alongside `web_search` and `web_fetch` when search mode is switched OFF.
  - Exposed as standard tool in standalone stdio MCP server (`dsh-web-tools-mcp`) with `readOnlyHint` and `openWorldHint` annotations.
  - Configurable `webReadEnabled` setting (default `true`) with English and Simplified Chinese localizations.

## v0.4 development features — first released in v0.5.0

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

## [0.3.10] - 2026-11-24

### Fixed
- Hotfix on the `0.3.9` line for default HTTPS port validation (#18) and repeated per-turn Auto-mode hints (#17).

## [0.3.9] - 2026-11-04

### Added
- Keenable search provider adapter with date filtering (`published_after`, `published_before`) and domain scoping.

### Fixed
- Quota synchronization and key pooling diagnostics.

## [0.3.8] - 2026-10-25

### Added
- Plugin display metadata (icon and localized title/description) for DSH 0.2.1-rc.3+.

## [0.3.7] - 2026-10-18

### Fixed
- Added an on-demand criterion in Smart (`auto`) mode so models know when to reach for web tools.

## [0.3.6] - 2026-10-18

### Added
- Custom search provider editor, DSH 0.2.1 compatibility, and three-state search mode (`auto` / `required` / `off`).

## [0.3.5] - 2026-10-05

### Added
- DSH 0.1.7 / 0.2.x session v4 and settings compatibility (#6, #7), custom search provider outbound SSRF defense, and native Xiaohongshu / Twitter (X) browser session retrieval.

## [0.3.3] - 2026-09-03

### Added
- Built-in generic web fetcher (local Defuddle extraction) with per-hop redirect and DNS SSRF guards.
