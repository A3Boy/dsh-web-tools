<div align="center">

# 🔎 dsh-web-tools

**Open-source multi-provider web tools plugin for DeepSeek Harness**

Unified Web Search / Fetch · Multi-Provider · BYOK · Account Pools · Quota Dashboard · Auto-Failover

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

**English** | [简体中文](README.zh-CN.md)

</div>

---

## ✨ Why dsh-web-tools?

DeepSeek Harness ships with a single DeepSeek search provider, while the
community's single-engine plugins (Exa, Firecrawl, Tavily…) each go their own
way. **dsh-web-tools aggregates search engines into one provider**:

- 🧩 **One plugin = 7 search engines**: Tavily / Exa / Firecrawl / Brave / You.com / Jina / SearXNG
- 🎛️ **Minimal model tool surface**: the model only ever sees the official
  `web_search` / `web_fetch` tools — all complexity lives below the provider boundary
- 🔑 **BYOK + account pools**: multiple keys per engine (comma-separated),
  **least-used-first** rotation, failed keys auto-marked unhealthy
- 📊 **Real quota dashboard**: Tavily / Firecrawl / You.com show **official
  authoritative balances**, Jina best-effort, SearXNG self-hosted (no quota)
- 🔄 **Deterministic fallback**: 429 / 408 / 5xx / timeout / network / auth
  errors auto-switch to the next provider; quota-aware (skip only when exhausted)
- 🛡️ **Security first**: API keys live in `ctx.credentials` — **never sent back
  to the browser**; config writes go through a loopback fence
- 🖥️ **Native settings UI**: `Settings → Plugins → Plugin configuration → dsh-web-tools`, no YAML editing

---

## 📦 Install

```bash
# 1. Install (after npm publish):
dsh plugin --profile web add dsh-web-tools

# 2. Add "dsh-web-tools" to dsh.profile.bundles in the profile's package.json
#    (needed for file: local deps; `dsh plugin add` handles it after npm publish)

# 3. Fully restart
dsh web
```

> ⚠️ Local development: the plugin needs peer deps resolved
> (`@deepseek-ai/*`) — a junction to the DSH profile's `node_modules` works.

---

## 🚀 Quick Start

1. Open `Settings → Plugins → Plugin configuration → dsh-web-tools`
2. Fill in API keys per engine (comma-separated keys → an account pool)
3. Pick the **default engine** and configure the **fallback order**
4. Hit **Test** to verify a connection, **Test Search** to run a real search

### Supported Providers

| Provider | Type | Search | Fetch | Quota | Quota Source |
|---|---|---|---|---|---|
| [Tavily](https://tavily.com) | AI search | ✅ | ✅ | ✅ | official `/usage` |
| [Exa](https://exa.ai) | Semantic | ✅ | ✅ | ⚠️ | local estimate |
| [Firecrawl](https://firecrawl.dev) | Search+scrape | ✅ | ✅ | ✅ | official credit-usage |
| [Brave](https://search.brave.com) | Independent index | ✅ | ❌ | 🚧 | response header (V2) |
| [You.com](https://you.com) | AI search | ✅ | ❌ | ✅ | official balance API |
| [Jina](https://jina.ai) | Reader+search | ✅ | ✅ | ✅ | best-effort |
| [SearXNG](https://docs.searxng.org) | Self-hosted | ✅ | ❌ | — | no platform quota |

> **V2 plan**: Serper (no authoritative quota), Parallel (balance needs OAuth),
> Perplexity (billing is an unofficial web API)

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
   ├── Pools     per-engine multi-key least-used-first rotation
   ├── Quota     official API / best-effort / local estimate
   └── Providers Tavily · Exa · Firecrawl · Brave · You.com · Jina · SearXNG
```

```
Settings card (client)
   ↓ fetch /web-tools/api/* (fenced, loopback only)
Host routes (config/save · credentials/set · test/* · quota/describe)
   ↓
ctx.settings (dsh-web-tools namespace, non-secret config)
ctx.credentials (WEB_TOOLS_<PROVIDER>, key pools)
```

---

## 🔐 Credentials

| Provider | Credential ref | Notes |
|---|---|---|
| Tavily | `WEB_TOOLS_TAVILY` | comma-separated keys |
| Exa | `WEB_TOOLS_EXA` | highlights mode |
| Firecrawl | `WEB_TOOLS_FIRECRAWL` | /search + /scrape |
| Brave | `WEB_TOOLS_BRAVE` | X-Subscription-Token |
| You.com | `WEB_TOOLS_YOU` | USD balance |
| Jina | `WEB_TOOLS_JINA` | s.jina.ai + r.jina.ai |
| SearXNG | `WEB_TOOLS_SEARXNG` | baseUrl (self-hosted) |

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

---

## 🤝 Contributing

PRs welcome! Adding a provider is just implementing the `ProviderAdapter`
contract and registering it — see [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

[MIT](LICENSE) © A3Boy
