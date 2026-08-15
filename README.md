<div align="center">

# 🔎 dsh-web-tools

**Open-source unified Web Search / Fetch infrastructure for DeepSeek Harness.**

`dsh-web-tools` aggregates multiple web search providers under DeepSeek
Harness's native `ctx.web` capability, giving agents unified search, page
fetching, provider management, BYOK, credential pools, quota & health
monitoring, deterministic fallback, and self-hosted search.

The agent side stays minimal:

```text
web_search
web_fetch
```

The model never needs to know Tavily, Exa, Brave, Firecrawl, or any other
provider exists. Provider selection, credential management, quota state,
health checks, and fallback all happen underneath the plugin.

> **One tool surface. Multiple providers. Quota-aware fallback.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

**English** | [简体中文](README.zh-CN.md)

</div>

---

## ✨ What problem does it solve?

DeepSeek Harness already ships a native Web capability (`ctx.web`) and several
search providers (DeepSeek, Exa, Perplexity, …). But when you use multiple
search services together, you still have to handle separately:

- API keys for different providers
- Different Search / Fetch APIs
- Different quota & billing units
- Provider outages / 429 / 5xx / timeouts
- Key invalidation / free-quota exhaustion
- Switching, configuring, and diagnosing search providers
- Self-hosted search (SearXNG)

`dsh-web-tools` converges all of this into a single DSH provider:

```text
                    DSH Agent
                        │
                 web_search
                 web_fetch
                        │
                DSH Native Web
                     ctx.web
                        │
                dsh-web-tools
                        │
       ┌────────────────┼────────────────┐
       │                │                │
    Routing          Quota           Health
       │                │                │
       └────────────────┼────────────────┘
                        │
       ┌────────────────┼────────────────────┐
       │                │                    │
     Tavily            Exa                 Brave
   Firecrawl          Jina                You.com
     SearXNG           ...                  ...
```

---

## 🚀 Core capabilities

### 🧩 Multi-provider web search

One plugin manages many search backends. Currently supported:

- **Tavily** — AI-agent search & content extraction
- **Exa** — semantic / neural search
- **Firecrawl** — search + scrape / web content
- **Brave Search** — independent search index
- **You.com** — AI search API
- **Jina** — search + reader
- **SearXNG** — fully self-hosted meta search

More backends (Serper, Parallel, Perplexity, private/enterprise search) can be
added through the unified `ProviderAdapter` contract. **Adding a provider never
changes the agent tool surface.**

### 🎛️ Minimal agent tool surface

`dsh-web-tools` never registers `tavily_search` / `exa_search` /
`brave_search`… The model always uses only the official DeepSeek Harness tools
`web_search` / `web_fetch`. All complexity stays below the provider boundary:

- Prompts never need to know each engine
- The model never decides which service to use
- Switching providers does not affect the agent
- New providers add no new tools
- Provider failures never pollute agent reasoning

### 🔄 Deterministic provider fallback

Configure a default provider plus a fallback order (e.g. `Tavily → Exa →
Brave → SearXNG`). On a **recoverable** failure of the default provider, the
next one is tried automatically:

- HTTP 408 / 429 / 5xx
- network errors / request timeouts
- provider temporarily unavailable
- credential confirmed unavailable (auth errors mark unhealthy and continue)
- authoritative quota confirmed exhausted (quota-aware skip)

**No fallback** for 400 invalid queries or config/schema errors. The whole
process is transparent to the agent — no extra tool calls, no replanning.

### 📊 Quota-aware tracking

Different engines have completely different quota semantics (credits /
requests / USD / tokens / self-hosted). `dsh-web-tools` manages these through
a unified Quota abstraction that **explicitly distinguishes** official balance,
official usage, response headers, best-effort, local estimate, self-hosted,
and unsupported — it never pretends every provider is the same "percentage
left".

| Provider | Quota approach | Notes |
|---|---|---|
| Tavily | official `/usage` | credits, incl. search/extract/crawl/map/research breakdown |
| Firecrawl | official Credit Usage API | credits + billing period |
| You.com | official Account Balance API | USD balance |
| Brave | **search response headers** (`X-RateLimit-*`) | requests, captured on every search, zero extra requests |
| Exa | official Team Management usage | needs extra service key; plain key → local estimate |
| Jina | `r.jina.ai` Balance left | best-effort; format changes degrade to unavailable |
| SearXNG | none | self-hosted, no platform credits |

**Quota is always observability, never a hard dependency of search** — a quota
failure never breaks a search.

### 🔑 BYOK + Credential Pool

`dsh-web-tools` provides no shared API keys — everything is **Bring Your Own
Key**. Each provider can hold multiple **legitimate** credentials:

```text
Tavily
 ├─ Key A
 ├─ Key B
 └─ Key C
```

Keys are selected **least-used-first**; failed credentials are automatically
degraded with health state. For: team workspaces, multiple legitimate API
keys, key rollover, separate environments, BYOK, credential fault isolation,
and key rotation.

> Credential Pools serve legitimate multi-key scenarios (teams / environments /
> rollover / isolation) — not quota-evasion via throwaway accounts.

### ❤️ Provider / Credential health

Runtime health states: `Ready` / `Auth Error` / `Rate Limited` / `Unavailable`
/ `Unknown`. A bad credential never permanently kills a provider — healthy
keys in the same pool keep working.

### 🖥️ Native DSH settings UI

No manual `.env` / YAML / `cordis.patch.yml` / `config.json` editing. Install,
then open:

```text
Settings → Plugins → Plugin configuration → dsh-web-tools
```

The settings page provides: Web Search toggle, default provider, fallback
order, max results, timeout, per-provider enable/disable, API key & multi-
credential config, base URL (SearXNG), provider health, quota, **Test
connection**, **Test search**, and recent search status/latency.

### 🧪 Provider test & test search

Every provider supports a **real connection test** (a minimal request, not
just "key exists"), distinguishing 401 / 429 / timeout; the settings page can
run a real search to confirm availability, the actual provider used, result
quality, and latency.

### 🌐 Search + Fetch

Full web-agent chain: `web_search` → candidate URLs → `web_fetch` → page
content → agent answer. Native provider Fetch/Extract capabilities are used
when available.

### 🏠 Self-hosted as a first-class citizen

SearXNG is a first-class provider (not a temporary fallback): use it as the
fallback behind cloud search, or run **pure self-hosted** with no commercial
search API at all. For privacy-first, local, homelab, and enterprise-network
setups.

### 🛡️ Secret security

API keys live in the DeepSeek Harness **credential capability**. The browser
only ever sees `configured: true` / masked values — it can never obtain the
full secret. Keys never appear in browser responses, settings JSON, console
logs, error stacks, test snapshots, or the git repository.

### 🔒 Configuration-plane security

Config and credential operations sit behind a **loopback / local
configuration boundary** — remote pages cannot modify search providers, API
keys, fallbacks, or credentials through ordinary requests.

### 🧠 Quota-aware, not a smart router

No model-driven provider selection, no AI router, no ML ranking, no provider
bandits. The router uses: user-configured order + provider availability +
credential health + confirmed-exhausted quota + recoverable request errors —
**deterministic and explainable first**.

### ⚡ Provider failure ≠ agent failure

```text
Tavily 429 → fallback → Exa success → web_search success
```

The model never perceives infrastructure failures.

### 🧱 Independent, removable, zero core patches

No DeepSeek Harness core changes, no leftover agent-prompt / tool-definition /
provider-SDK modifications, no global runtime hooks. Install → enable →
configure → use; uninstall removes everything cleanly.

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
   ├── Pools     per-engine multi-credential least-used-first rotation
   ├── Quota     official API / response header / best-effort / local estimate
   ├── Health    runtime health state
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

## 🛠️ Development

```bash
npm install
npx tsc -p tsconfig.json --noEmit           # Host type-check
npx tsc -p tsconfig.client.json --noEmit    # Client type-check
npx tsc -p tsconfig.build.json              # build lib/
node --experimental-strip-types --test src/host/logic.test.ts   # unit tests
node --experimental-strip-types test/routes.smoke.mjs           # route smoke
```

## 🤝 Contributing

PRs welcome! Adding a provider is just implementing the `ProviderAdapter`
contract and registering it — see [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

[MIT](LICENSE) © A3Boy
