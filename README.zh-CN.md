<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="180" />
</p>

# 🔎 dsh-web-tools

**一个 Web Tool Surface，统一管理所有搜索 Provider。**

`dsh-web-tools` 是 DeepSeek Harness 的开源 Web Search / Fetch 聚合层，在保持 Agent 只使用原生 `web_search` / `web_fetch` 的同时，统一提供多 Provider、BYOK、多凭据、额度监控、健康状态、确定性故障切换和自托管搜索。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/Tests-12%20unit%20%2B%20smoke%20passing-brightgreen.svg)](test/)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.md) | **简体中文**

</div>

---

## 🖥️ 一图速览

<!-- TODO: 截图占位 — 原生设置卡实际渲染图（Settings → Plugins → Plugin configuration） -->
<!-- 之后在此插入真实截图，例如： ![dsh-web-tools 设置页](assets/settings.png) -->

| | 能力 | 解决什么问题 |
|---|---|---|
| 🌐 | **统一搜索** | Tavily / Exa / Brave / Firecrawl / Jina / You.com / SearXNG 统一接入 |
| 🔑 | **BYOK + 凭据池** | 每个 Provider 独立管理合法凭据，不需要共享 Key |
| 📊 | **额度感知** | 官方余额 / Usage / Rate Limit / Best-effort 状态统一展示 |
| ❤️ | **健康监控** | 认证失败、限流、额度耗尽、超时等状态统一管理 |
| 🔄 | **确定性故障切换** | Provider 故障时按明确顺序切换，不让 Agent 重规划 |
| 📖 | **搜索 + 抓取** | 搜索结果之后继续抓取正文，完成完整 Web Agent 链路 |
| 🏠 | **自托管** | SearXNG 一等支持，不强依赖商业搜索服务 |
| 🖥️ | **原生设置 UI** | Provider、Key、额度、Fallback、测试搜索全部在 DSH 设置页完成 |

---

## ✨ 为什么需要它？

DeepSeek Harness 已提供原生 Web capability（`ctx.web`）和多个搜索 Provider，但每个 Provider 的凭据、额度、健康状态、路由和配置仍然彼此独立——**由你手动管理差异**：

```text
没有 dsh-web-tools

DSH
├── DeepSeek provider
├── Exa provider
├── Perplexity provider
├── Firecrawl community provider
└── ...
        ↓
用户自己管理配置、Key、状态和切换
```

```text
有了 dsh-web-tools

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

`dsh-web-tools` 是 **Web Provider 编排层**——不是一个又一个搜索插件。

---

## 🔌 支持的 Provider

| Provider | 搜索 | Fetch | 额度 | 额度来源 | 自托管 |
| --- | :---: | :---: | :---: | --- | :---: |
| [Tavily](https://tavily.com) | ✅ | ✅ | ✅ | 官方 `/usage` | — |
| [Exa](https://exa.ai) | ✅ | ✅ | ⚠️ | Usage / Key Budget | — |
| [Firecrawl](https://firecrawl.dev) | ✅ | ✅ | ✅ | 官方 Credit Usage | ⚠️ |
| [Brave](https://search.brave.com) | ✅ | — | ✅ | Rate-limit 响应头 | — |
| [You.com](https://you.com) | ✅ | — | ✅ | 官方 Balance API | — |
| [Jina](https://jina.ai) | ✅ | ✅ | ⚠️ | Best-effort token 余额 | — |
| [SearXNG](https://docs.searxng.org) | ✅ | — | ∞ | 无 Provider 额度 | ✅ |

> 额度信息绝不参与搜索正确性。额度检测失败时，搜索依然可用。

计划中：Serper · Parallel · Perplexity · 更多社区 Provider（见 [Provider 开发](#-provider-开发)）。

---

## 📊 额度感知——官方时用官方，拿不到就诚实

不同引擎的额度语义完全不同。`dsh-web-tools` 如实展示每一种，绝不伪装成统一的"剩余百分比"：

```text
Tavily        823 / 1,000 credits        Official
Firecrawl     711 / 1,000 credits        Official · Reset Sep 1
Brave         943 requests remaining     Response Header · Updated 3 min ago
Jina          8.2M tokens left           Best effort
Exa           $3.82 used this month      Account balance unavailable
SearXNG       Self-hosted                No provider quota
```

- **官方时用官方**：Tavily `/usage`、Firecrawl credit-usage、You.com balance、Brave rate-limit 响应头（每次搜索自动捕获，零额外请求）。
- **拿不到就诚实**：Exa usage 需 Team Management 凭据；Jina 是 best-effort 解析；不支持的一律显示 `Unavailable`，绝不猜测。
- **额度是观测，不是搜索依赖**——额度失败绝不影响搜索。Quota-aware 路由只用权威数据跳过**确认耗尽**的 Provider。

---

## 🔑 BYOK + 凭据池

无共享 Key——全部 **Bring Your Own Key**。每个 Provider 可配置多个合法凭据，按**最少使用优先**选择；失败凭据自动降级并维护健康状态。

```text
Tavily
 ├─ Key A
 ├─ Key B
 └─ Key C
```

适用于：团队 Workspace · 多个合法 API Key · Key rollover · 不同环境 · BYOK · 凭据故障隔离 · Key rotation。

> 凭据池服务于合法多 Key 场景——不用于规避配额。

---

## 🔄 确定性故障切换

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
<!-- 之后在此插入真实截图，例如： ![fallback 实际效果](assets/fallback.png) -->

**Provider 故障 ≠ Agent 故障。**

可恢复故障触发切换：408 / 429 / 5xx · 网络 · 超时 · Provider 不可用 · 确认失效的凭据 · 权威确认耗尽的额度。400 / 配置错误不切换。顺序确定、对 Agent 透明——不产生额外 Tool Call、不重规划。

---

## 📖 搜索 + 抓取

完整 Web Agent 链路端到端可用：

```text
web_search  →  候选 URL  →  web_fetch  →  网页正文  →  回答
```

具备原生提取能力的 Provider（Tavily、Exa、Firecrawl、Jina）直接使用；其余干净降级。

---

## 🖥️ 设置 UI 与测试搜索

一切都在 DSH 原生设置中完成——不需要 YAML、不需要 `.env`：

```text
Settings → Plugins → Plugin configuration → dsh-web-tools
```

- 默认 Provider · fallback 顺序 · 结果数 · 超时
- 每 Provider 启用/禁用、API Key、多凭据池、Base URL
- 每 Provider **测试连接**（真实最小请求；区分 401 / 429 / 超时）
- **测试搜索**——真实查询，看到实际 Provider、延迟与结果，无需先开 Agent 对话

---

## 🏠 自托管，一等支持

SearXNG 是一等 Provider，不是临时 fallback：

- 云搜索的 fallback：`Tavily → Exa → Brave → SearXNG`
- 或**纯自托管**：完全不配任何商业搜索 API

适合隐私优先、本地部署、Homelab、企业网络。

---

## 🚀 快速开始

```bash
dsh plugin --profile web add dsh-web-tools
```

```text
重启 dsh web
→ Settings
→ Plugins
→ dsh-web-tools
```

就这么多。源码安装 / junction / peer 依赖说明见 [开发](#-开发) 与 [疑难排查](#疑难排查)。

---

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
   ├── Pools     每引擎凭据轮换（最少使用优先）
   ├── Quota     官方 / 响应头 / best-effort / 本地估算
   ├── Health    运行时凭据与 Provider 状态
   └── Providers Tavily · Exa · Firecrawl · Brave · You.com · Jina · SearXNG
```

```
设置卡 (client)
   ↓ fetch /web-tools/api/*（fenced，仅 loopback）
Host routes（config/save · credentials/set · test/* · quota/describe）
   ↓
ctx.settings（dsh-web-tools namespace，非敏感配置）
ctx.credentials（WEB_TOOLS_<PROVIDER>，凭据池）
```

---

## 🛡️ 安全与隐私

- 凭据在 **DSH Host** 上解析。
- 完整 API Key **永不回传浏览器**——只有 `configured` / 掩码状态。
- 日志与测试响应都会掩码凭据内容。
- **不向 dsh-web-tools 或任何地方发送使用遥测**。
- 无共享 Key、无强制代理服务器。
- 配置写入限制在**本地配置平面**（loopback 围栏）。
- 可完全不使用商业搜索服务，仅靠 SearXNG。

---

## ✅ 已验证

| 项目 | 状态 |
|---|---|
| Host 类型检查 | ✅ |
| Client 类型检查 | ✅ |
| 单元测试（pool / fallback / Jina 余额 / Brave 响应头） | ✅ 12 通过 |
| 路由冒烟（配置 · 凭据零泄漏 · 额度 · 测试 · 围栏 403） | ✅ |
| Tavily 真实搜索 + 官方额度 | ✅ |
| Exa 真实搜索（双 Key）+ 凭据池轮换 | ✅ |
| Firecrawl 真实搜索 + 抓取 + 官方额度 | ✅ |
| Web profile 安装（`dsh --dump-config`） | ✅ |
| 非 loopback 配置写入被拒绝 | ✅ |

本地复跑：见 [开发](#-开发)。

---

## ⚙️ 配置

凭据 ref（逗号分隔值 → 凭据池）：

| Provider | Credential ref | 说明 |
|---|---|---|
| Tavily | `WEB_TOOLS_TAVILY` | 多 key 逗号分隔 |
| Exa | `WEB_TOOLS_EXA` | highlights 模式 |
| Firecrawl | `WEB_TOOLS_FIRECRAWL` | /search + /scrape |
| Brave | `WEB_TOOLS_BRAVE` | X-Subscription-Token |
| You.com | `WEB_TOOLS_YOU` | USD 余额 |
| Jina | `WEB_TOOLS_JINA` | s.jina.ai + r.jina.ai |
| SearXNG | `WEB_TOOLS_SEARXNG` | baseUrl（自托管） |

设置 namespace：`dsh-web-tools`（enabled、defaultProvider、maxResults、searchTimeoutMs、fallbackOrder、maxFallbackProviders、providerBaseUrls、providerEnabled）。

---

## 🧱 设计边界

`dsh-web-tools` **不是**：

- 一个新的 Agent
- Web Search 规划器
- MCP 代理
- AI Provider 选择器
- 托管搜索网关
- 共享 API Key 服务
- DSH `web_search` / `web_fetch` 的替代品

它是 DSH 原生 Web 能力背后的**Provider 编排层**。

---

## 📦 安装 / 更新 / 移除

```bash
# 安装
dsh plugin --profile web add dsh-web-tools

# 更新
dsh plugin --profile web update dsh-web-tools

# 移除
dsh plugin --profile web remove dsh-web-tools
```

移除插件会干净地移除其运行时与 UI 集成，**不修改 DSH core**——无残留 prompt、工具定义或全局钩子。

---

## 🤖 让 Agent 帮你安装

复制给 Codex / Claude Code / 任意编码 Agent：

```text
安装 dsh-web-tools，来源：
https://github.com/A3Boy/dsh-web-tools

要求：
- 优先使用 `dsh plugin --profile web add dsh-web-tools`。
- 不要读取或打印 API Key 值。
- 不要修改 DeepSeek Harness core。
- 安装后用 `dsh --profile web --dump-config` 校验组合配置。
- 未经询问不要重启正在运行的 DSH 进程。
- 报告 dsh-web-tools 是否出现在 Web profile 中。
```

---

## 🔌 Provider 开发

新增 Provider 只需实现 `ProviderAdapter` 契约（`src/host/providers/types.ts`）并在 `src/host/providers/index.ts` 注册——Agent 工具面永不改变。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 🗺️ Roadmap

- **V1.1** — Exa Team-Management usage 接入设置 UI
- **V1.2** — Serper · Parallel（OAuth 余额）· Perplexity（实验性）
- **V2** — 用量历史图表 · Provider 对比基准 · Brave 响应头进入 quota/describe

---

## 🛠️ 开发

```bash
npm install
npx tsc -p tsconfig.json --noEmit           # Host 类型检查
npx tsc -p tsconfig.client.json --noEmit    # Client 类型检查
npx tsc -p tsconfig.build.json              # 构建 lib/
node --experimental-strip-types --test src/host/logic.test.ts   # 单元测试
node --experimental-strip-types test/routes.smoke.mjs           # 路由冒烟
```

本地开发需要可解析 DSH peer 依赖——用 junction 指向 DSH profile 的 `node_modules` 即可。

### 疑难排查

- **插件不在 `--dump-config` 中**——确保 profile 的 `package.json` 的 `dsh.profile.bundles` 里有 `dsh-web-tools`（npm 安装会自动处理）。
- **设置卡不显示**——完全重启 `dsh web`；client bundle 在启动时加载。

---

## 🤝 贡献

欢迎 PR！详见 [CONTRIBUTING.md](CONTRIBUTING.md) 的 Provider 开发指南与约定。

## 📄 License

[MIT](LICENSE) © A3Boy
