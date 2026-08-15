<div align="center">

# 🔎 dsh-web-tools

**DeepSeek Harness 的开源统一 Web Search / Fetch 基础设施。**

`dsh-web-tools` 将多个 Web Search Provider 聚合到 DeepSeek Harness 原生 `ctx.web` 能力之下，为 Agent 提供统一的搜索、网页读取、Provider 管理、BYOK、多凭据、额度监控、健康状态、故障切换和自托管搜索能力。

Agent 侧保持极简：

```text
web_search
web_fetch
```

模型不需要知道 Tavily、Exa、Brave、Firecrawl 或其他 Provider 的存在。

Provider 选择、凭据管理、额度状态、健康检查和 fallback 全部由插件在底层完成。

> **One tool surface. Multiple providers. Quota-aware fallback.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.md) | **简体中文**

</div>

---

## ✨ 它解决什么问题？

DeepSeek Harness 已经提供原生 Web capability（`ctx.web`）和多个搜索 Provider（DeepSeek、Exa、Perplexity 等），但当同时使用多个搜索服务时，仍然需要分别处理：

- 不同 Provider 的 API Key
- 不同的 Search / Fetch API
- 不同额度与计费单位
- Provider 临时故障 / 429 / 5xx / timeout
- Key 失效 / 免费额度耗尽
- 搜索 Provider 切换与配置
- 自托管搜索（SearXNG）
- Provider 状态诊断

`dsh-web-tools` 将这些能力统一收敛到一个 DSH Provider 中：

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

## 🚀 核心能力

### 🧩 多 Provider Web Search

一个插件统一管理多个搜索后端。当前支持：

- **Tavily** — 面向 AI Agent 的搜索与内容提取
- **Exa** — 语义 / Neural Search
- **Firecrawl** — Search + Scrape / Web 内容获取
- **Brave Search** — 独立搜索索引
- **You.com** — AI Search API
- **Jina** — Search + Reader
- **SearXNG** — 完全自托管的 Meta Search

后续可继续通过统一 `ProviderAdapter` 契约增加：Serper、Parallel、Perplexity、其他 Search API、私有/企业内部 Search Provider。**新增 Provider 不需要修改 Agent Tool Surface。**

### 🎛️ 保持 Agent Tool Surface 极简

`dsh-web-tools` 不会给模型注册 `tavily_search` / `exa_search` / `brave_search`… 模型始终只使用 DeepSeek Harness 官方工具 `web_search` / `web_fetch`。复杂性全部留在 Provider 边界以下：

- Prompt 不需要认识每个搜索引擎
- 模型不需要决定使用哪家服务
- 切换 Provider 不影响 Agent
- 增加新 Provider 不增加 Tool 数量
- Provider 故障不会污染 Agent reasoning

### 🔄 确定性 Provider Fallback

可配置默认 Provider + fallback 顺序（如 `Tavily → Exa → Brave → SearXNG`）。当默认 Provider 出现**可恢复故障**时自动尝试下一个：

- HTTP 408 / 429 / 5xx
- 网络错误 / 请求超时
- Provider 临时不可用
- Credential 已确认不可用（auth 错误 → 标记 unhealthy 并继续 fallback）
- 权威额度确认耗尽（quota-aware skip）

**不 fallback**：400 invalid query、配置/schema 错误。整个过程对 Agent 透明，不产生额外 Tool Call。

### 📊 Quota-aware 额度感知

不同搜索服务的额度体系完全不同（credits / requests / USD / tokens / self-hosted）。`dsh-web-tools` 用统一 Quota abstraction 管理这些语义，**明确区分**官方权威余额、官方 Usage、Response Header、Best-effort、本地估算、Self-hosted、Unsupported——绝不把所有 Provider 伪装成同一种"剩余百分比"。

| Provider | Quota 方案 | 说明 |
|---|---|---|
| Tavily | 官方 `/usage` | credits，含 search/extract/crawl/map/research breakdown |
| Firecrawl | 官方 Credit Usage API | credits + billing period |
| You.com | 官方 Account Balance API | USD 余额 |
| Brave | **Search 响应头**（`X-RateLimit-*`） | requests，每次正常搜索自动捕获，零额外请求 |
| Exa | 官方 Team Management usage | 需额外 service key；普通 key 为本地估算 |
| Jina | `r.jina.ai` Balance left | best-effort，格式变化自动降级为 unavailable |
| SearXNG | 无 | self-hosted，无平台 credits |

**Quota 永远是 observability，不是 Search 的强依赖**——额度查询失败绝不影响搜索。

### 🔑 BYOK + Credential Pool（多凭据）

`dsh-web-tools` 不提供共享 API Key，全部 **Bring Your Own Key**。每个 Provider 可配置多个**合法** Credential：

```text
Tavily
 ├─ Key A
 ├─ Key B
 └─ Key C
```

按**最少使用优先**选择可用 Key；失败凭据自动降级并维护健康状态。适用于：团队 Workspace、多个合法 API Key、Key rollover、不同环境、BYOK、Credential 故障隔离、Key rotation。

> Credential Pool 服务于合法多 Key 场景（团队/环境/轮换/隔离），不用于规避单账号额度限制。

### ❤️ Provider / Credential Health

插件维护运行时健康状态：`Ready` / `Auth Error` / `Rate Limited` / `Unavailable` / `Unknown`。凭据异常不会导致整个 Provider 永久失效——同 Provider 的其他健康 Key 继续可用。

### 🖥️ DSH 原生设置 UI

无需手动编辑 `.env` / YAML / `cordis.patch.yml` / `config.json`。安装后直接进入：

```text
Settings → Plugins → Plugin configuration → dsh-web-tools
```

设置页统一提供：Web Search 开关、默认 Provider、Fallback 顺序、Max Results、Timeout、Provider 启用/禁用、API Key 与多凭据配置、Base URL（SearXNG）、Provider Health、Quota、**测试连接**、**Test Search**、最近搜索状态与延迟。

### 🧪 Provider Test & Test Search

每个 Provider 支持**真实连接测试**（执行最小请求，非仅检查 Key 存在），区分 401 / 429 / Timeout；设置页可运行真实搜索，直接确认可用性、实际使用的 Provider、返回质量与延迟。

### 🌐 Search + Fetch

完整 Web Agent 链路：`web_search` → 候选 URL → `web_fetch` → 网页正文 → Agent 回答。支持 Provider 原生 Fetch/Extract 能力。

### 🏠 Self-hosted First-class

SearXNG 是一等 Provider（非临时 fallback）：可作云搜索的 fallback，也可**完全不配置任何商业 API** 纯自托管运行。适合隐私优先 / 本地部署 / Homelab / 企业网络。

### 🛡️ Secret 安全

API Key 经 DeepSeek Harness **credential capability** 保存，浏览器只能看到 `configured: true` / masked 值，**永远无法获得完整 Secret**。Key 不出现在 Browser response / Settings JSON / Console log / Error stack / Test snapshot / Git repository。

### 🔒 配置平面安全

配置与 Credential 操作受 **loopback / local configuration boundary** 保护——远程网页不能通过普通请求修改 Search Provider / API Key / Fallback / Credential。

### 🧠 Quota-aware，但不是复杂智能路由

不使用模型选择 Provider，不引入 AI Router / ML ranking / Provider bandit。Router 依据：用户配置顺序 + Provider availability + Credential health + 确认耗尽的 quota + 可恢复请求错误——**确定性和可解释性第一**。

### ⚡ Provider Failure ≠ Agent Failure

```text
Tavily 429 → fallback → Exa success → web_search success
```

模型不需要感知基础设施故障。

### 🧱 独立、可移除、零 Core Patch

不修改 DeepSeek Harness core，不残留 Agent prompt / Tool definition / Provider SDK 魔改 / 全局 Runtime hook。安装 → 启用 → 配置 → 使用；卸载即干净移除。

---

## 📦 安装

```bash
# 1. 安装（npm 发布后：）
dsh plugin --profile web add dsh-web-tools

# 2. 在 profile package.json 的 dsh.profile.bundles 加入 "dsh-web-tools"
#    （file: 本地依赖需要手动加；npm 发布后 dsh plugin add 自动处理）

# 3. 完全重启
dsh web
```

## 🏗️ 架构

```
DSH Agent
   ↓   只见 web_search / web_fetch
dsh-tool-web（官方工具，由插件重新启用）
   ↓
ctx.web（searchProvider: dsh-web-tools）
   ↓
dsh-web-tools SearchHubProvider
   ├── Router    确定性 fallback + quota-aware skip
   ├── Pools     每引擎多凭据最少使用优先轮换
   ├── Quota     官方 API / response header / best-effort / local estimate
   ├── Health    运行时健康状态
   └── Providers Tavily · Exa · Firecrawl · Brave · You.com · Jina · SearXNG
```

```
设置页 (client card)
   ↓ fetch /web-tools/api/*（fenced，仅 loopback）
Host routes（config/save · credentials/set · test/* · quota/describe）
   ↓
ctx.settings（dsh-web-tools namespace，非敏感配置）
ctx.credentials（WEB_TOOLS_<PROVIDER>，凭据池）
```

## 🔐 凭据

| Provider | Credential ref | 说明 |
|---|---|---|
| Tavily | `WEB_TOOLS_TAVILY` | 多 key 逗号分隔 |
| Exa | `WEB_TOOLS_EXA` | highlights 模式 |
| Firecrawl | `WEB_TOOLS_FIRECRAWL` | /search + /scrape |
| Brave | `WEB_TOOLS_BRAVE` | X-Subscription-Token |
| You.com | `WEB_TOOLS_YOU` | USD 余额 |
| Jina | `WEB_TOOLS_JINA` | s.jina.ai + r.jina.ai |
| SearXNG | `WEB_TOOLS_SEARXNG` | baseUrl（自托管） |

## 🛠️ 开发

```bash
npm install
npx tsc -p tsconfig.json --noEmit           # Host 类型检查
npx tsc -p tsconfig.client.json --noEmit    # Client 类型检查
npx tsc -p tsconfig.build.json              # 构建 lib/
node --experimental-strip-types --test src/host/logic.test.ts   # 单测
node --experimental-strip-types test/routes.smoke.mjs           # 路由冒烟
```

## 🤝 贡献

欢迎 PR！新增 Provider 只需实现 `ProviderAdapter` 契约并注册——详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 License

[MIT](LICENSE) © A3Boy
