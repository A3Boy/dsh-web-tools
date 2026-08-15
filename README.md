<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="180" />
</p>

# 🔎 dsh-web-tools

**One Web interface. Every search provider underneath.**

`dsh-web-tools` is a unified Web Search & Fetch layer for DeepSeek Harness —
multi-provider routing, BYOK credentials, quota awareness, health monitoring,
deterministic fallback, and self-hosted search, all behind the native
`web_search` / `web_fetch` tools.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/Tests-12%20unit%20%2B%20smoke%20passing-brightgreen.svg)](test/)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

**English** | [简体中文](README.zh-CN.md)

</div>

---

## 🖥️ At a glance

<!-- TODO: 截图占位 — 原生设置卡实际渲染图（Settings → Plugins → Plugin configuration） -->
<!-- 之后在此插入真实截图，例如： ![dsh-web-tools settings](assets/settings.png) -->

| | Capability | What it solves |
|---|---|---|
| 🌐 | **Unified Search** | Tavily / Exa / Brave / Firecrawl / Jina / You.com / SearXNG under one provider |
| 🔑 | **BYOK & Credential Pools** | Per-provider legitimate credentials, no shared keys |
| 📊 | **Quota Awareness** | Official balance / usage / rate-limit / best-effort shown honestly |
| ❤️ | **Health Monitoring** | Auth errors, rate limits, exhaustion, timeouts — tracked & surfaced |
| 🔄 | **Deterministic Fallback** | Clear provider order on failure, no agent replanning |
| 📖 | **Search + Fetch** | Search results → page content → full web-agent chain |
| 🏠 | **Self-hosted** | SearXNG first-class; no commercial API required |
| 🖥️ | **Native Settings UI** | Providers, keys, quota, fallback, test search — all in DSH settings |

---

## ✨ Why dsh-web-tools?

DeepSeek Harness already ships a native Web capability (`ctx.web`) and several
search providers. But each provider's credentials, quota, health, routing, and
configuration remain independent — *you* manage the differences:

```text
Without dsh-web-tools

DSH
├── DeepSeek provider
├── Exa provider
├── Perplexity provider
├── Firecrawl community provider
└── ...
        ↓
you manage config, keys, state, and switching yourself
```

```text
With dsh-web-tools

DSH Agent
   │
web_search / web_fetch
   │
dsh-web-tools
   │
├── Routing
├── Credential Pool
├── Quota
├── Health
├── Fallback
└── Diagnostics
        │
   ┌────┼────┬─────┬─────┐
 Tavily Exa Brave Firecrawl ...
```

`dsh-web-tools` is a **Web Provider orchestration layer** — not another
search plugin.

---

## 🔌 Supported Providers

| Provider | Search | Fetch | Quota | Quota source | Self-hosted |
| --- | :---: | :---: | :---: | --- | :---: |
| [Tavily](https://tavily.com) | ✅ | ✅ | ✅ | Official `/usage` | — |
| [Exa](https://exa.ai) | ✅ | ✅ | ⚠️ | Usage / Key Budget | — |
| [Firecrawl](https://firecrawl.dev) | ✅ | ✅ | ✅ | Official Credit Usage | ⚠️ |
| [Brave](https://search.brave.com) | ✅ | — | ✅ | Rate-limit headers | — |
| [You.com](https://you.com) | ✅ | — | ✅ | Official Balance API | — |
| [Jina](https://jina.ai) | ✅ | ✅ | ⚠️ | Best-effort token balance | — |
| [SearXNG](https://docs.searxng.org) | ✅ | — | ∞ | No provider quota | ✅ |

> Quota information never participates in search correctness. If quota
> detection fails, search remains available.

Planned: Serper · Parallel · Perplexity · more community providers (see
[Provider development](#-provider-development)).

---

## 🆓 Free tiers & when to use each

Official free allowances as of 2026-08 — combine them instead of betting on a
single provider:

| Provider | Free allowance | Period | Best for |
|---|---|---|---|
| **Tavily** | 1,000 credits | ♻️ monthly | ⭐ default agent search |
| **Exa** | $20 signup + $10 | ♻️ $10/mo | 🧠 semantic / research |
| **Firecrawl** | 1,000 credits + 1,000 search credits | ♻️ monthly | 📖 search + scrape |
| **Brave** | $5 ≈ 1,000 searches | ♻️ monthly | 🌐 general independent index |
| **You.com** | **$100** | 🎁 one-time | 💰 large-scale experiments |
| **Jina** | **10M tokens** | 🎁 one-time | 📄 search + reader |
| **SearXNG** | no platform quota | ♾️ self-hosted | 🏠 permanent fallback |

> **Don't bet on one search provider.** Combine each one's free allowance,
> search character, and self-hosted option so `web_search` keeps working when
> a single provider runs out.

Suggested default orderings (also usable as fallback presets):

- **General agent**: `Tavily → Exa → Brave → SearXNG`
- **Deep page reading**: Tavily / Exa search → Firecrawl / Jina fetch
- **Maximize free quota**: `You.com → Exa → Tavily → Brave → Firecrawl → SearXNG`

---

## 📊 Quota awareness — official when possible, honest when not

Different engines have completely different quota semantics. `dsh-web-tools`
shows each honestly instead of faking a uniform "percentage left":

```text
Tavily        823 / 1,000 credits        Official
Firecrawl     711 / 1,000 credits        Official · Reset Sep 1
Brave         943 requests remaining     Response Header · Updated 3 min ago
Jina          8.2M tokens left           Best effort
Exa           $3.82 used this month      Account balance unavailable
SearXNG       Self-hosted                No provider quota
```

- **Official when possible**: Tavily `/usage`, Firecrawl credit-usage,
  You.com balance, Brave rate-limit headers (captured on every search — zero
  extra requests).
- **Honest when not**: Exa usage needs Team Management credentials; Jina is a
  best-effort parse; unsupported providers show `Unavailable`, never a guess.
- **Quota is observability, not a search dependency** — a quota failure never
  breaks a search. Quota-aware routing only *skips* providers confirmed
  exhausted with authoritative data.

---

## 🔑 BYOK + Credential Pools

No shared keys — **Bring Your Own Key**. Each provider can hold multiple
legitimate credentials, selected **least-used-first**; failed credentials are
auto-degraded with health state.

```text
Tavily
 ├─ Key A
 ├─ Key B
 └─ Key C
```

For: team workspaces · multiple legitimate API keys · key rollover ·
separate environments · BYOK · credential fault isolation · key rotation.

> Credential Pools serve legitimate multi-key scenarios — not quota evasion.

---

## 🔄 Deterministic fallback

```text
Tavily
  │
  └─ HTTP 429
       ↓
      Exa
       │
       └─ timeout
            ↓
           Brave
            │
            └─ 5 results
                 ↓
            web_search success
```

<!-- TODO: 截图占位 — fallback 实际发生的界面/日志状态 -->
<!-- 之后在此插入真实截图，例如： ![fallback in action](assets/fallback.png) -->

**Provider failure does not have to become Agent failure.**

Fallback triggers on recoverable failures: 408 / 429 / 5xx · network ·
timeout · provider unavailable · confirmed-bad credential · authoritatively
exhausted quota. No fallback on 400 / config errors. Deterministic order,
transparent to the agent — no extra tool calls, no replanning.

---

## 📖 Search + Fetch

The full web-agent chain works end to end:

```text
web_search  →  candidate URLs  →  web_fetch  →  page content  →  answer
```

Providers with native extract capabilities (Tavily, Exa, Firecrawl, Jina) use
them; others fall through cleanly.

---

## 🖥️ Settings UI & Test Search

Everything is configured in DSH's native settings — no YAML, no `.env`:

```text
Settings → Plugins → Plugin configuration → dsh-web-tools
```

- Default provider · fallback order · max results · timeout
- Per-provider enable/disable, API keys, multi-credential pools, base URL
- **Test connection** per provider (real minimal request; distinguishes
  401 / 429 / timeout)
- **Test Search** — run a real query, see the actual provider, latency, and
  results, without opening an agent conversation

---

## 🏠 Self-hosted, first-class

SearXNG is a first-class provider, not a temporary fallback:

- As a fallback behind cloud search: `Tavily → Exa → Brave → SearXNG`
- Or **purely self-hosted**: no commercial search API at all

For privacy-first, local, homelab, and enterprise-network setups.

---

## 🚀 Quick Start

```bash
dsh plugin --profile web add dsh-web-tools
```

```text
Restart dsh web
→ Settings
→ Plugins
→ dsh-web-tools
```

That's it. Source install / junction / peer-dependency notes live in
[Development](#-development) and
[Troubleshooting](#troubleshooting).

---

## 🏗️ Architecture

```
DSH Agent
   ↓   only sees web_search / web_fetch
dsh-tool-web (official tools, re-enabled by this plugin)
   ↓
ctx.web (searchProvider: dsh-web-tools)
   ↓
dsh-web-tools SearchHubProvider
   ├── Router    deterministic fallback + quota-aware skip
   ├── Pools     per-engine credential rotation (least-used-first)
   ├── Quota     official / response-header / best-effort / local estimate
   ├── Health    runtime credential & provider state
   └── Providers Tavily · Exa · Firecrawl · Brave · You.com · Jina · SearXNG
```

```
Settings card (client)
   ↓ fetch /web-tools/api/* (fenced, loopback only)
Host routes (config/save · credentials/set · test/* · quota/describe)
   ↓
ctx.settings (dsh-web-tools namespace, non-secret config)
ctx.credentials (WEB_TOOLS_<PROVIDER>, credential pools)
```

---

## 🛡️ Security & Privacy

- Credentials are resolved on the **DSH Host**.
- Full API keys are **never returned to the browser** — only
  `configured` / masked state.
- Logs and test responses mask credential material.
- **No usage telemetry** is sent to dsh-web-tools or anywhere else.
- No shared keys, no mandatory proxy server.
- Configuration writes are restricted to the **local configuration plane**
  (loopback fence).
- SearXNG can be used without any commercial search provider.

---

## ✅ Verified

| Area | Status |
|---|---|
| Host typecheck | ✅ |
| Client typecheck | ✅ |
| Unit tests (pool / fallback / Jina balance / Brave headers) | ✅ 12 passing |
| Route smoke (config · credentials-no-leak · quota · test · fence 403) | ✅ |
| Tavily real search + official quota | ✅ |
| Exa real search (2 keys) + credential-pool rotation | ✅ |
| Firecrawl real search + scrape + official quota | ✅ |
| Web profile installation (`dsh --dump-config`) | ✅ |
| Non-loopback config write rejected | ✅ |

Run locally: see [Development](#-development).

---

## ⚙️ Configuration

Credential refs (comma-separated values → credential pool):

| Provider | Credential ref | Notes |
|---|---|---|
| Tavily | `WEB_TOOLS_TAVILY` | comma-separated keys |
| Exa | `WEB_TOOLS_EXA` | highlights mode |
| Firecrawl | `WEB_TOOLS_FIRECRAWL` | /search + /scrape |
| Brave | `WEB_TOOLS_BRAVE` | X-Subscription-Token |
| You.com | `WEB_TOOLS_YOU` | USD balance |
| Jina | `WEB_TOOLS_JINA` | s.jina.ai + r.jina.ai |
| SearXNG | `WEB_TOOLS_SEARXNG` | baseUrl (self-hosted) |

Settings namespace: `dsh-web-tools` (enabled, defaultProvider, maxResults,
searchTimeoutMs, fallbackOrder, maxFallbackProviders, providerBaseUrls,
providerEnabled).

---

## 🧱 Design boundaries

`dsh-web-tools` is **not**:

- a new Agent
- a Web Search planner
- an MCP proxy
- an AI provider selector
- a hosted search gateway
- a shared API-key service
- a replacement for DSH `web_search` / `web_fetch`

It is a **provider orchestration layer** behind DSH's native Web capability.

---

## 📦 Install / Update / Remove

```bash
# install
dsh plugin --profile web add dsh-web-tools

# update
dsh plugin --profile web update dsh-web-tools

# remove
dsh plugin --profile web remove dsh-web-tools
```

Removing the plugin removes its runtime and UI integration **without modifying
DSH core** — no leftover prompts, tool definitions, or global hooks.

---

## 🤖 Install with your coding agent

Copy this to Codex / Claude Code / any coding agent:

```text
Install dsh-web-tools from:
https://github.com/A3Boy/dsh-web-tools

Requirements:
- Prefer `dsh plugin --profile web add dsh-web-tools`.
- Do not read or print API key values.
- Do not modify DeepSeek Harness core.
- Validate the composed profile after installation
  (`dsh --profile web --dump-config`).
- Do not restart an existing DSH process without asking.
- Report whether dsh-web-tools appears in the Web profile.
```

---

## 🔌 Provider development

Adding a provider is implementing the `ProviderAdapter` contract
(`src/host/providers/types.ts`) and registering it in
`src/host/providers/index.ts` — the agent tool surface never changes.
See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 🗺️ Roadmap

- **V1.1** — Exa Team-Management usage wiring in the settings UI
- **V1.2** — Serper · Parallel (OAuth balance) · Perplexity (experimental)
- **V2** — usage history chart · provider comparison benchmark ·
  Brave header quota into quota/describe

---

## 🛠️ Development

```bash
npm install
npx tsc -p tsconfig.json --noEmit           # Host type-check
npx tsc -p tsconfig.client.json --noEmit    # Client type-check
npx tsc -p tsconfig.build.json              # build lib/
node --experimental-strip-types --test src/host/logic.test.ts   # unit tests
node --experimental-strip-types test/routes.smoke.mjs           # route smoke
```

Local development needs the DSH peer deps resolvable — a junction to the DSH
profile's `node_modules` works.

### Troubleshooting

- **Plugin not in `--dump-config`** — ensure `dsh-web-tools` is in
  `dsh.profile.bundles` in the profile's `package.json` (auto for npm installs).
- **Settings card missing** — restart `dsh web` fully; the client bundle loads
  at startup.

---

## 🤝 Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the provider-adapter
guide and conventions.

## 📄 License

[MIT](LICENSE) © A3Boy
